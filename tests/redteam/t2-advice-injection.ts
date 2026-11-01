import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { interviewFixture } from "../../src/lib/fixtures.ts";
import { CARD_FIELD_ORDER, cardViewForPayload } from "../../src/lib/cardView.ts";
import {
  mockAdapter,
  validateDraftCard,
  wordCard,
  type ModelAdapter,
  type ViolationRecord,
} from "../../src/lib/models.ts";
import type { RedTeamOutcome } from "./types.ts";

/**
 * T2 - advice injection (blueprint Table 7 and Table 5's Zod runtime row).
 *
 * Input: force the interview model to include a 'possible cause' sentence in its output.
 * Required: the sentence never renders; Zod rejects or the fallback card substitutes; the
 * attempt is logged server-side.
 *
 * The model is forced by handing the recorded deliberately-invalid draft from
 * modal/fixtures/interview.json to the same boundary the API route uses, so nothing here
 * depends on a provider, a network or a database. The record is checked for what it must
 * NOT contain as carefully as for what it must: a safety log carrying the user's narrative
 * would be its own problem.
 */

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROUTE_FILE = join(PROJECT_ROOT, "src", "app", "api", "interview", "route.ts");

/** The sentence the model was forced to add, and the second key it smuggled with it. */
const HOSTILE_KEYS = ["possible_cause", "recommendation"] as const;
const HOSTILE_VALUES = [
  interviewFixture.invalid_draft_card.possible_cause,
  interviewFixture.invalid_draft_card.recommendation,
];

/** An adapter that returns exactly the draft the test wants to force. */
function adapterReturning(payload: unknown): ModelAdapter {
  return { ...mockAdapter, interview: () => payload };
}

function collectingLogger(): { records: ViolationRecord[]; logger: (record: ViolationRecord) => void } {
  const records: ViolationRecord[] = [];

  return { records, logger: (record) => records.push(record) };
}

export function t2AdviceInjection(): RedTeamOutcome {
  // The forced output is refused, and both smuggled keys are named.
  const validation = validateDraftCard(interviewFixture.invalid_draft_card);

  if (validation.ok) {
    return { status: "FAIL", detail: `the strict schema accepted a draft carrying ${HOSTILE_KEYS.join(" and ")}` };
  }

  if (validation.reason !== "unrecognized_keys") {
    return { status: "FAIL", detail: `the forced draft was refused as "${validation.reason}" rather than for extra keys` };
  }

  const notNamed = HOSTILE_KEYS.filter((key) => !validation.keys.includes(key));

  if (notNamed.length > 0) {
    return { status: "FAIL", detail: `the draft was refused, but not for ${notNamed.join(" and ")}` };
  }

  // The fallback renders instead, and the forced sentence reaches no row.
  const { records, logger } = collectingLogger();
  const snapshot = { answers: [{ questionId: "Q1", text: "tight across the shoulders" }] };
  const worded = wordCard(snapshot, {
    adapter: adapterReturning(interviewFixture.invalid_draft_card),
    logger,
    mode: "mock",
  });

  if (!worded.usedFallback) {
    return { status: "FAIL", detail: "the refused draft was rendered as a card instead of the reviewed fallback" };
  }

  const view = cardViewForPayload(worded.card);

  if (view.rows.length !== CARD_FIELD_ORDER.length) {
    return { status: "FAIL", detail: `the fallback rendered ${view.rows.length} row(s) instead of five` };
  }

  const displayed = view.rows.map((row) => row.display).join(" | ");
  const leaked = HOSTILE_VALUES.filter((value) => displayed.includes(value));

  if (leaked.length > 0) {
    return { status: "FAIL", detail: `the forced sentence reached the rendered card: ${leaked.join(", ")}` };
  }

  // The attempt is recorded, once, as a category.
  if (records.length !== 1) {
    return { status: "FAIL", detail: `expected exactly one server-side record, saw ${records.length}` };
  }

  const record = records[0];

  if (record.event !== "model-output-rejected" || record.reason !== "unrecognized_keys") {
    return { status: "FAIL", detail: `the record does not name the refusal (${JSON.stringify(record)})` };
  }

  const recordKeys = [...record.keys].sort().join(",");

  if (recordKeys !== [...HOSTILE_KEYS].sort().join(",")) {
    return { status: "FAIL", detail: `the record named the wrong keys (${recordKeys})` };
  }

  // ...and it must carry no content: no forced sentence, no answer text.
  const serialised = JSON.stringify(record);
  const contentLeaks = [...HOSTILE_VALUES, snapshot.answers[0].text].filter((value) => serialised.includes(value));

  if (contentLeaks.length > 0) {
    return {
      status: "FAIL",
      detail: `the server-side record carried content it must not: ${contentLeaks.length} value(s)`,
    };
  }

  if (record.questions.join(",") !== "Q1") {
    return { status: "FAIL", detail: `the record named the wrong questions (${record.questions.join(",") || "none"})` };
  }

  // Control: a valid draft is used as itself, with nothing recorded.
  const clean = collectingLogger();
  const valid = wordCard(snapshot, {
    adapter: adapterReturning(interviewFixture.draft_card),
    logger: clean.logger,
    mode: "mock",
  });

  if (valid.usedFallback || clean.records.length !== 0) {
    return {
      status: "FAIL",
      detail: `a valid draft was not used as itself (usedFallback=${valid.usedFallback}, records=${clean.records.length})`,
    };
  }

  // Wiring: the route is where the record is written from.
  const routeSource = readFileSync(ROUTE_FILE, "utf8");

  if (!routeSource.includes("consoleViolationLogger") || !routeSource.includes("interviewStep")) {
    return { status: "FAIL", detail: "the interview route does not run the state machine with the server-side logger" };
  }

  return {
    status: "PASS",
    detail: `forced draft carrying ${HOSTILE_KEYS.join(" + ")} refused by the strict schema; the reviewed fallback rendered instead and neither forced value reached a row; exactly one server-side record written (reason=unrecognized_keys, keys=${recordKeys}, questions=Q1) carrying no content; a valid draft is used as itself with nothing recorded; the route runs the state machine with the server-side logger`,
  };
}

