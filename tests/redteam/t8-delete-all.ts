import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RedTeamOutcome } from "./types.ts";

/**
 * T8 - delete-all (blueprint Table 7 and Chapter 6.1).
 *
 * Required: "Create three sessions with photos, press Delete everything, inspect the
 * database and storage bucket -> Rows and storage objects gone; auth account survives; no
 * orphaned files."
 *
 * This row does NOT run the live deletion - that needs the local stack, and this pack is
 * deliberately offline. What it does instead:
 *
 *   1. audits the migrations that make the deletion safe (cascades, RLS delete policies, a
 *      `security invoker` row function, a storage policy keyed on the owner segment, and no
 *      trigger anywhere touching storage.objects);
 *   2. audits the action's own source for the rules that must never slip: the prefix comes
 *      from the verified session, and no admin path exists;
 *   3. requires **recorded live evidence** that is newer than the code it covers.
 *
 * Until that evidence exists - or if it predates the current implementation - the row
 * reports PARTIAL with the live clause named as unverified, which is what the blueprint's
 * "not until the live test passes" rule means in this pack.
 */

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EVIDENCE_FILE = join(PROJECT_ROOT, "supabase", "tests", "delete-everything-evidence.json");
const MIGRATION_001 = join(PROJECT_ROOT, "supabase", "migrations", "001_init.sql");
const MIGRATION_002 = join(PROJECT_ROOT, "supabase", "migrations", "002_delete_my_app_data.sql");

/** The implementation the live evidence has to be newer than. */
const FILES_UNDER_TEST = [
  join(PROJECT_ROOT, "src", "lib", "storageObjects.ts"),
  join(PROJECT_ROOT, "src", "lib", "deleteEverything.ts"),
  join(PROJECT_ROOT, "src", "lib", "appRows.ts"),
  join(PROJECT_ROOT, "src", "app", "api", "delete-everything", "route.ts"),
  MIGRATION_002,
];

/** The assertions the live run has to have made, by name. */
const REQUIRED_LIVE_ASSERTIONS = [
  "rows_removed",
  "objects_removed",
  "prefix_verified_empty",
  "account_survives",
  "sign_in_again",
  "other_account_untouched",
  "cascade_removes_cards",
  "repeat_is_safe",
  "partial_failure_reports_failure",
  "partial_failure_leaves_rows",
  "retry_completes",
];

type LiveEvidence = { ok?: unknown; ranAt?: unknown; assertions?: unknown };

/** The live evidence, when it exists and parses. */
function readEvidence(): LiveEvidence | null {
  if (!existsSync(EVIDENCE_FILE)) return null;

  try {
    return JSON.parse(readFileSync(EVIDENCE_FILE, "utf8")) as LiveEvidence;
  } catch {
    return null;
  }
}

/**
 * SQL with its comments removed. An audit that reads prose as code reports failures that
 * are not there - this file's own "no security definer" comment proved the point.
 */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n\r]*/g, " ");
}

export function t8DeleteAll(): RedTeamOutcome {
  const migration001 = stripSqlComments(readFileSync(MIGRATION_001, "utf8"));
  const migration002 = stripSqlComments(readFileSync(MIGRATION_002, "utf8"));

  // 1. The database half: RLS on every table, a delete policy on each, the cascade graph,
  //    and the storage policy keyed on the owner's path segment.
  const tables = ["public.profiles", "public.sessions", "public.cards", "public.journal_entries"];

  for (const table of tables) {
    if (!migration001.includes(`alter table ${table}`) || !migration001.includes("enable row level security")) {
      return { status: "FAIL", detail: `${table} is not covered by the row-level-security statements` };
    }
  }

  for (const policy of ["profiles_delete_own", "sessions_delete_own", "journal_entries_delete_own", "cards_delete_own"]) {
    if (!migration001.includes(`create policy ${policy}`)) {
      return { status: "FAIL", detail: `the delete policy ${policy} is missing` };
    }
  }

  if (!/cards_delete_own[\s\S]{0,400}exists \(\s*select 1 from public\.sessions/.test(migration001)) {
    return { status: "FAIL", detail: "cards ownership is no longer derived from the owning session" };
  }

  const cascades = migration001.match(/on delete cascade/g) ?? [];

  if (cascades.length < 4) {
    return { status: "FAIL", detail: `only ${cascades.length} of the four foreign keys cascade` };
  }

  if (!migration001.includes("session_photos_delete_own") || !migration001.includes("storage.foldername(name))[1]")) {
    return { status: "FAIL", detail: "the storage delete policy no longer keys on the owner's path segment" };
  }

  if (/create trigger[\s\S]{0,200}storage\.objects/i.test(migration001)) {
    return { status: "FAIL", detail: "a trigger now touches storage.objects, which the design forbids" };
  }

  // 2. The row function: invoker rights, granted narrowly, and cards left to the cascade.
  if (!/create or replace function public\.delete_my_app_data\(\)[\s\S]{0,400}security invoker/.test(migration002)) {
    return { status: "FAIL", detail: "delete_my_app_data is not a security invoker function" };
  }

  if (/security definer/i.test(migration002)) {
    return { status: "FAIL", detail: "a security definer function exists in the delete path" };
  }

  if (!migration002.includes("grant execute on function public.delete_my_app_data() to authenticated")) {
    return { status: "FAIL", detail: "delete_my_app_data is not granted to authenticated only" };
  }

  if (/delete from public\.cards/i.test(migration002)) {
    return {
      status: "FAIL",
      detail: "the row function deletes cards directly, so the cascade is no longer what removes them",
    };
  }

  // 3. The action's source.
  const routePath = join(PROJECT_ROOT, "src", "app", "api", "delete-everything", "route.ts");
  const route = readFileSync(routePath, "utf8");

  if (!route.includes("session.userId") || !route.includes("currentSession()")) {
    return { status: "FAIL", detail: "the route does not derive the prefix from a verified session" };
  }

  if (/request\.json\(\)|await request\.text\(\)/.test(route)) {
    return { status: "FAIL", detail: "the route reads the request body, so a caller could supply an identity" };
  }

  const actionFiles = [
    join(PROJECT_ROOT, "src", "lib", "deleteEverything.ts"),
    join(PROJECT_ROOT, "src", "lib", "appRows.ts"),
    join(PROJECT_ROOT, "src", "lib", "storageHttpClient.ts"),
    routePath,
  ];

  for (const file of actionFiles) {
    if (/admin\/users|service_role|serviceRole/i.test(readFileSync(file, "utf8"))) {
      return { status: "FAIL", detail: `an admin or service-role path appears in ${file.split(/[\\/]/).pop()}` };
    }
  }

  // 4. The live evidence, and its freshness.
  const evidence = readEvidence();

  if (!evidence || evidence.ok !== true || typeof evidence.ranAt !== "string") {
    return {
      status: "PARTIAL",
      detail:
        "migrations, cascade graph, RLS delete policies, the security invoker row function and the action's source all check out, but no passing live run is recorded",
      unverified: [
        "the live end-to-end deletion (supabase/tests/delete_everything.ts) has not been run against this implementation, so rows/objects gone, the surviving account and the absence of orphans are unproven",
      ],
    };
  }

  const ranAt = Date.parse(evidence.ranAt);

  if (Number.isNaN(ranAt)) {
    return { status: "FAIL", detail: "the recorded live evidence carries an unreadable timestamp" };
  }

  const assertions = (evidence.assertions ?? {}) as Record<string, unknown>;
  const missing = REQUIRED_LIVE_ASSERTIONS.filter((name) => assertions[name] !== true);

  if (missing.length > 0) {
    return { status: "FAIL", detail: `the recorded live run did not pass: ${missing.join(", ")}` };
  }

  const stale = FILES_UNDER_TEST.filter((file) => existsSync(file))
    .map((file) => ({ file, mtime: fileMtime(file) }))
    .filter((entry) => entry.mtime > ranAt);

  if (stale.length > 0) {
    return {
      status: "PARTIAL",
      detail: `the recorded live run predates the current implementation (${stale.length} file(s) changed since)`,
      unverified: [
        `the live deletion has not been re-run since ${stale.map((entry) => entry.file.split(/[\\/]/).pop()).join(", ")} changed`,
      ],
    };
  }

  return {
    status: "PASS",
    detail: `live run recorded ${evidence.ranAt}: ${REQUIRED_LIVE_ASSERTIONS.length} assertions passed, including rows and objects gone, the prefix independently verified empty, the account still able to sign in, the other account untouched, the session-to-card cascade, a safe repeat, and a controlled partial failure that reported failure, left the rows alone and completed on retry; the migrations, RLS delete policies, security invoker row function, storage owner-segment policy and the action's session-derived prefix all check out, and the evidence postdates every file it covers`,
  };
}

/** A file's modification time in milliseconds. */
function fileMtime(file: string): number {
  return statSync(file).mtimeMs;
}

