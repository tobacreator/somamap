import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CARD_NOT_ANSWERED } from "../../src/lib/copy.ts";
import { CARD_FIELD_ORDER, PLACEHOLDER_VALUES, cardViewForPayload } from "../../src/lib/cardView.ts";
import { FALLBACK_CARD, sensationCardSchema } from "../../src/lib/schema.ts";
import type { RedTeamOutcome } from "./types.ts";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION_FILE = join(PROJECT_ROOT, "supabase", "migrations", "001_init.sql");

/** The two keys Table 7's T3 payload smuggles in. */
const HOSTILE_KEYS = ["possible_cause", "recommendation"] as const;

/** The text those keys carry. Neither may reach the rendered card. */
const HOSTILE_VALUES = ["a long day at the desk", "rest and drink water"] as const;

/** The table's own machinery, never card content. */
export const BOOKKEEPING_COLUMNS = ["id", "session_id", "created_at", "updated_at"] as const;

/** The five approved content columns - Table 8 and iron rule 1. */
export const APPROVED_CONTENT_COLUMNS = [
  "location_label",
  "quality_words",
  "intensity_metaphor",
  "duration",
  "user_own_sentence",
] as const;

/**
 * Reads the cards table's content columns out of the migration text: every column in the
 * definition except the bookkeeping ones, and nothing else. A column the table does not
 * have cannot be stored, which is what makes this the second layer of iron rule 1.
 */
export function contentColumnsFromMigration(sql: string): { ok: boolean; columns: string[]; detail: string } {
  const table = /create table if not exists public\.cards \(([\s\S]*?)\n\);/i.exec(sql);

  if (!table) {
    return { ok: false, columns: [], detail: "the cards table definition was not found in the migration" };
  }

  const columns: string[] = [];

  for (const rawLine of table[1].split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith("--") || line.startsWith("constraint")) continue;

    const name = /^([a-z_][a-z0-9_]*)\s/.exec(line);

    if (name) columns.push(name[1]);
  }

  const bookkeeping: readonly string[] = BOOKKEEPING_COLUMNS;
  const content = columns.filter((column) => !bookkeeping.includes(column));

  return { ok: true, columns: content, detail: `columns=${columns.length} content=${content.length}` };
}


/**
 * T3 - extra-field attack (blueprint Table 7).
 *
 * Input: a model response JSON containing possible_cause and recommendation keys.
 * Required: Zod .strict() rejects the payload; the fallback card renders; the cards
 * table stores only the five fields.
 *
 * The payload is built as JSON text and parsed, so the check walks the same path a
 * model response would take. No model is called: the hostile payload is crafted
 * locally, exactly as Table 7 prescribes.
 *
 * Only the first of the three required clauses can be verified today: there is no
 * card renderer (blueprint Chapter 6) and no cards table (Chapter 4.1, deliberately
 * out of scope here). The row therefore reports PARTIAL and names the two clauses it
 * cannot prove, so the gate stays red. Nothing here fabricates a renderer or a
 * database to turn the row green.
 */
export function t3ExtraFieldAttack(): RedTeamOutcome {
  const hostilePayload = JSON.stringify({
    ...FALLBACK_CARD,
    possible_cause: "a long day at the desk",
    recommendation: "rest and drink water",
  });

  const result = sensationCardSchema.safeParse(JSON.parse(hostilePayload));

  if (result.success) {
    return {
      status: "FAIL",
      detail: `the strict schema accepted a payload carrying ${HOSTILE_KEYS.join(" and ")}`,
    };
  }

  const rejectedKeys = result.error.issues.flatMap((issue) =>
    issue.code === "unrecognized_keys" ? issue.keys : [],
  );

  const notNamed = HOSTILE_KEYS.filter((key) => !rejectedKeys.includes(key));

  if (notNamed.length > 0) {
    return {
      status: "FAIL",
      detail: `the payload was rejected, but not for ${notNamed.join(" and ")}`,
    };
  }

  const fallback = sensationCardSchema.safeParse(FALLBACK_CARD);

  if (!fallback.success) {
    return {
      status: "FAIL",
      detail: "the fallback card does not validate, so it cannot substitute for rejected output",
    };
  }

  // Clause 2 - the fallback renders in its place, and no hostile text can reach the card.
  const view = cardViewForPayload(JSON.parse(hostilePayload));

  if (!view.usedFallback) {
    return { status: "FAIL", detail: "the rejected payload was rendered as a card instead of the reviewed fallback" };
  }

  if (view.rows.length !== CARD_FIELD_ORDER.length) {
    return {
      status: "FAIL",
      detail: `the card view rendered ${view.rows.length} row(s); the card has ${CARD_FIELD_ORDER.length} field(s)`,
    };
  }

  const displayed = view.rows.map((row) => row.display).join(" | ");
  const leaked = HOSTILE_VALUES.filter((value) => displayed.includes(value));

  if (leaked.length > 0) {
    return { status: "FAIL", detail: `hostile payload text reached the rendered card: ${leaked.join(", ")}` };
  }

  const placeholdersOnScreen = view.rows.filter((row) => PLACEHOLDER_VALUES.includes(row.display));

  if (placeholdersOnScreen.length > 0) {
    return {
      status: "FAIL",
      detail: `a placeholder was displayed as an answer: ${placeholdersOnScreen.map((row) => row.field).join(", ")}`,
    };
  }

  const unanswered = view.rows.filter((row) => !row.answered);

  if (unanswered.length !== PLACEHOLDER_VALUES.length) {
    return {
      status: "FAIL",
      detail: `${unanswered.length} row(s) rendered as unanswered; the fallback carries ${PLACEHOLDER_VALUES.length} placeholder value(s)`,
    };
  }

  if (unanswered.some((row) => row.display !== CARD_NOT_ANSWERED)) {
    return { status: "FAIL", detail: "an unanswered row did not render the explicit not-answered state" };
  }

  // Clause 3 - the cards table can only store the five content fields.
  const migration = contentColumnsFromMigration(readFileSync(MIGRATION_FILE, "utf8"));

  if (!migration.ok) {
    return { status: "FAIL", detail: `the cards table could not be read: ${migration.detail}` };
  }

  const missingColumns = APPROVED_CONTENT_COLUMNS.filter((column) => !migration.columns.includes(column));
  const extraColumns = migration.columns.filter(
    (column) => !(APPROVED_CONTENT_COLUMNS as readonly string[]).includes(column),
  );

  if (missingColumns.length > 0 || extraColumns.length > 0) {
    return {
      status: "FAIL",
      detail: `cards content columns differ from the five approved ones (missing: ${missingColumns.join(", ") || "none"}; extra: ${extraColumns.join(", ") || "none"})`,
    };
  }

  return {
    status: "PASS",
    detail: `rejected with unrecognized_keys [${rejectedKeys.join(", ")}]; the reviewed fallback rendered with ${unanswered.length} explicit not-answered row(s) and no hostile text (${HOSTILE_VALUES.join(", ")} all absent); cards content columns in supabase/migrations/001_init.sql are exactly the five approved fields, with the bookkeeping columns id, session_id, created_at and updated_at excluded`,
  };
}

