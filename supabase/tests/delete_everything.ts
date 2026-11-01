/**
 * SomaMap - delete-everything end-to-end test (LOCAL STACK ONLY)
 * supabase/tests/delete_everything.ts
 *
 * Blueprint Table 7's T8: "Create three sessions with photos, press Delete everything,
 * inspect the database and storage bucket -> Rows and storage objects gone; auth account
 * survives; no orphaned files."
 *
 * It drives the same modules the settings screen drives - the orchestrator, the storage
 * walk and the row function - against the local Supabase stack, with real accounts and real
 * objects. It never calls a model and never touches a remote project.
 *
 * What it asserts, in order:
 *   1. a controlled storage failure reports failure and leaves the rows alone;
 *   2. the retry completes;
 *   3. rows gone (sessions, cards, journal drafts, profile), objects gone, the account still
 *      able to sign in, and the second account untouched;
 *   4. the session-to-card cascade works;
 *   5. a repeat run is safe.
 *
 * The service key is used for three things only: creating and deleting the disposable test
 * accounts, counting rows independently of row-level security, and verifying the bucket is
 * empty afterwards. The user's deletion itself never uses it - that is the point of T8.
 *
 * Secrets: read from the local stack's own generated files, never printed, never written to
 * the evidence file. Run: node supabase/tests/delete_everything.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { appRowsDeleter } from "../../src/lib/appRows.ts";
import { deleteEverything } from "../../src/lib/deleteEverything.ts";
import { httpStorageClient } from "../../src/lib/storageHttpClient.ts";
import { clearPrefix, enumerateUnderPrefix, type StorageClient } from "../../src/lib/storageObjects.ts";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUCKET = "session-photos";
const EVIDENCE_FILE = join(PROJECT_ROOT, "supabase", "tests", "delete-everything-evidence.json");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

type Config = { baseUrl: string; anonKey: string; serviceKey: string };

function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    out[match[1]] = value;
  }

  return out;
}

function readLocalSecrets(): Record<string, string> {
  const base = join(PROJECT_ROOT, "supabase", ".temp", "start-secrets");
  const merged: Record<string, string> = {};
  if (!existsSync(base)) return merged;

  for (const service of readdirSync(base)) {
    Object.assign(merged, readEnvFile(join(base, service, "env", "docker.env")));
  }

  return merged;
}

function readApiPort(): string {
  const configPath = join(PROJECT_ROOT, "supabase", "config.toml");
  const match = /\[api\][\s\S]*?\n\s*port\s*=\s*(\d+)/.exec(readFileSync(configPath, "utf8"));

  if (!match) throw new Error("could not read the [api] port from supabase/config.toml");

  return match[1];
}

/** Payload metadata only: never the signature, never the token itself. */
function jwtIssuer(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(json) as { iss?: string };

    return typeof parsed.iss === "string" ? parsed.iss : null;
  } catch {
    return null;
  }
}

/** Fail closed: loopback only, local demo keys only. */
function resolveConfig(): Config {
  const baseUrl = `http://127.0.0.1:${readApiPort()}`;

  if (!LOOPBACK_HOSTS.has(new URL(baseUrl).hostname)) throw new Error("BLOCKED: target is not loopback");

  const secrets = readLocalSecrets();
  const anonKey = secrets.SUPABASE_ANON_KEY;
  const serviceKey = secrets.SUPABASE_SERVICE_ROLE_KEY;

  if (!anonKey || !serviceKey) throw new Error("BLOCKED: the local stack secrets are missing");

  for (const [name, key] of [["anon", anonKey], ["service", serviceKey]] as const) {
    if (jwtIssuer(key) !== "supabase-demo") {
      throw new Error(`BLOCKED: the ${name} key is not a local demo key`);
    }
  }

  return { baseUrl, anonKey, serviceKey };
}


// ---------------------------------------------------------------------------
// Small HTTP helpers. Bodies, headers, keys and tokens are never printed.
// ---------------------------------------------------------------------------

const assertions: Record<string, boolean> = {};

function check(name: string, ok: boolean, detail = ""): void {
  assertions[name] = ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail.length > 0 ? `  ${detail}` : ""}`);
}

type Access = "anon" | "service" | { token: string };

async function request(
  config: Config,
  path: string,
  init: { method: string; as: Access; body?: string; headers?: Record<string, string> },
): Promise<{ status: number; body: string }> {
  const key = init.as === "service" ? config.serviceKey : config.anonKey;
  const authorization = init.as === "anon" || init.as === "service" ? key : init.as.token;

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: init.method,
    headers: {
      apikey: key,
      authorization: `Bearer ${authorization}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    body: init.body,
  });

  return { status: response.status, body: await response.text() };
}

/** A disposable local account: sign up, and use the session the sign-up returns. */
async function createAccount(config: Config, email: string, password: string): Promise<{ userId: string; token: string }> {
  const created = await request(config, "/auth/v1/signup", {
    method: "POST",
    as: "anon",
    body: JSON.stringify({ email, password }),
  });

  const body = JSON.parse(created.body) as { access_token?: unknown; user?: { id?: unknown } };
  const userId = body.user?.id;
  const token = body.access_token;

  if (created.status !== 200 || typeof userId !== "string" || typeof token !== "string") {
    throw new Error(`sign-up failed with status ${created.status}`);
  }

  return { userId, token };
}

/** Sign in again with the same credentials: the "account survives" proof. */
async function signIn(config: Config, email: string, password: string): Promise<boolean> {
  const response = await request(config, "/auth/v1/token?grant_type=password", {
    method: "POST",
    as: "anon",
    body: JSON.stringify({ email, password }),
  });

  return response.status === 200 && response.body.includes("access_token");
}

async function insertRow(config: Config, token: string, table: string, row: Record<string, unknown>): Promise<void> {
  const response = await request(config, `/rest/v1/${table}`, {
    method: "POST",
    as: { token },
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(row),
  });

  if (response.status !== 201 && response.status !== 204) {
    throw new Error(`insert into ${table} failed with ${response.status}`);
  }
}

/** Rows for one account, counted with the service key so row-level security cannot hide them. */
async function countRows(config: Config, table: string, filter: string, key = "id"): Promise<number> {
  const response = await request(config, `/rest/v1/${table}?select=${key}&${filter}`, { method: "GET", as: "service" });

  if (response.status !== 200) throw new Error(`counting ${table} failed with ${response.status}`);

  const rows = JSON.parse(response.body) as unknown[];

  return Array.isArray(rows) ? rows.length : -1;
}

async function uploadObject(config: Config, token: string, path: string): Promise<void> {
  const response = await fetch(`${config.baseUrl}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: config.anonKey, authorization: `Bearer ${token}`, "content-type": "text/plain" },
    body: `photo for ${path}`,
  });

  if (response.status !== 200) throw new Error(`upload failed with ${response.status}`);
}

/** Every object under a prefix, walked with the service key so nothing is hidden. */
async function adminObjects(config: Config, prefix: string): Promise<string[]> {
  const client = httpStorageClient({
    baseUrl: config.baseUrl,
    bucket: BUCKET,
    anonKey: config.anonKey,
    accessToken: config.serviceKey,
  });
  const found = await enumerateUnderPrefix(client, prefix);

  return found.ok ? found.names : ["<walk failed>"];
}

async function deleteAccount(config: Config, userId: string): Promise<void> {
  await request(config, `/auth/v1/admin/users/${userId}`, { method: "DELETE", as: "service" });
}

/** A storage client whose delete is the silent no-op Entry 10 found: 200 with nothing reported. */
function brokenStorage(config: Config, token: string): StorageClient {
  const real = httpStorageClient({ baseUrl: config.baseUrl, bucket: BUCKET, anonKey: config.anonKey, accessToken: token });

  return {
    list: (prefix, offset) => real.list(prefix, offset),
    remove: async () => ({ ok: true, deleted: [], detail: "reported=0" }),
  };
}


// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------

type Account = { userId: string; token: string; email: string };

type Counts = { sessions: number; cards: number; journal: number; profiles: number };

async function countsFor(config: Config, account: Account, sessionIds: readonly string[]): Promise<Counts> {
  return {
    sessions: await countRows(config, "sessions", `user_id=eq.${account.userId}`),
    cards: await countRows(config, "cards", `session_id=in.(${sessionIds.join(",")})`),
    journal: await countRows(config, "journal_entries", `user_id=eq.${account.userId}`),
    profiles: await countRows(config, "profiles", `user_id=eq.${account.userId}`, "user_id"),
  };
}

/** Three sessions with photos, a card each, a journal draft and a profile row. */
async function seed(config: Config, account: Account, label: string): Promise<string[]> {
  await insertRow(config, account.token, "profiles", { user_id: account.userId, display_name: `delete test ${label}` });

  const sessionIds: string[] = [];

  for (let index = 1; index <= 3; index += 1) {
    const created = await request(config, "/rest/v1/sessions", {
      method: "POST",
      as: { token: account.token },
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        user_id: account.userId,
        photo_path: `${account.userId}/s${index}/photo.jpg`,
        region_label: "shoulder",
        view: "front",
      }),
    });

    const rows = JSON.parse(created.body) as { id?: unknown }[];
    const sessionId = rows[0]?.id;

    if (created.status !== 201 || typeof sessionId !== "string") {
      throw new Error(`the session insert failed with ${created.status}`);
    }

    sessionIds.push(sessionId);

    await insertRow(config, account.token, "cards", {
      session_id: sessionId,
      location_label: "shoulder",
      quality_words: ["tight"],
      intensity_metaphor: "like a scarf knotted too tight",
      duration: "today",
      user_own_sentence: "tight across the shoulders",
    });

    await uploadObject(config, account.token, `${account.userId}/s${index}/photo.jpg`);
  }

  await insertRow(config, account.token, "journal_entries", {
    user_id: account.userId,
    week_start: "2026-10-26",
    draft_text: "tight, three times",
    status: "draft",
  });

  return sessionIds;
}


async function main(): Promise<number> {
  const config = resolveConfig();
  const runTag = Date.now().toString(36);
  const password = `local-${runTag}-pw`;
  const emailA = `somamap-${runTag}-a@example.test`;
  const emailB = `somamap-${runTag}-b@example.test`;

  console.log(`SomaMap delete-everything end-to-end test - bucket ${BUCKET} - run ${runTag}`);

  const accountA: Account = { ...(await createAccount(config, emailA, password)), email: emailA };
  const accountB: Account = { ...(await createAccount(config, emailB, password)), email: emailB };

  const idsA = await seed(config, accountA, "A");
  const idsB = await seed(config, accountB, "B");

  const prefixA = `${accountA.userId}/`;
  const prefixB = `${accountB.userId}/`;
  const beforeB = await countsFor(config, accountB, idsB);
  const objectsBeforeB = await adminObjects(config, prefixB);

  console.log(`seeded A and B: 3 sessions each with photos; B's objects visible to the service key: ${objectsBeforeB.length}`);

  const credentials = { baseUrl: config.baseUrl, anonKey: config.anonKey, accessToken: accountA.token };

  // 1. A controlled storage failure: the delete answers 200 and reports nothing. The action
  //    must not call that success, and must not touch the rows.
  const broken = await deleteEverything({
    storage: brokenStorage(config, accountA.token),
    prefix: prefixA,
    deleteRows: appRowsDeleter(credentials),
    checkAccount: async () => ({ present: true, detail: "not reached" }),
  });

  check(
    "partial_failure_reports_failure",
    broken.ok === false && broken.failures.includes("storage"),
    `failures=${broken.failures.join(",") || "none"}`,
  );

  const afterBroken = await countsFor(config, accountA, idsA);
  const objectsAfterBroken = await adminObjects(config, prefixA);

  check(
    "partial_failure_leaves_rows",
    afterBroken.sessions === 3 && afterBroken.cards === 3 && afterBroken.journal === 1 && afterBroken.profiles === 1,
    `sessions=${afterBroken.sessions} cards=${afterBroken.cards} journal=${afterBroken.journal} profiles=${afterBroken.profiles}`,
  );

  check("partial_failure_leaves_objects", objectsAfterBroken.length === 3, `objects=${objectsAfterBroken.length}`);

  // 2. The retry, with the real storage calls and the real row function.
  const run = await deleteEverything({
    storage: httpStorageClient({ baseUrl: config.baseUrl, bucket: BUCKET, anonKey: config.anonKey, accessToken: accountA.token }),
    prefix: prefixA,
    deleteRows: appRowsDeleter(credentials),
    checkAccount: async () => {
      const still = await request(config, "/auth/v1/user", { method: "GET", as: { token: accountA.token } });

      return { present: still.status === 200, detail: "checked against the auth service" };
    },
  });

  check("retry_completes", run.ok === true, `failures=${run.failures.join(",") || "none"} deleted=${run.storage.deleted}`);
  check(
    "prefix_verified_empty",
    run.storage.verifiedEmpty === true && run.storage.remaining === 0,
    `remaining=${run.storage.remaining}`,
  );

  // 3. Rows and objects gone, counted independently of what the action reported.
  const afterA = await countsFor(config, accountA, idsA);
  const objectsAfterA = await adminObjects(config, prefixA);

  check(
    "rows_removed",
    afterA.sessions === 0 && afterA.cards === 0 && afterA.journal === 0 && afterA.profiles === 0,
    `sessions=${afterA.sessions} cards=${afterA.cards} journal=${afterA.journal} profiles=${afterA.profiles}`,
  );
  check("objects_removed", objectsAfterA.length === 0, `objects=${objectsAfterA.length}`);
  check("account_survives", run.accountPresent === true);

  // 4. The same account can sign in again.
  check("sign_in_again", await signIn(config, emailA, password));

  // 5. The other account is untouched.
  const afterB = await countsFor(config, accountB, idsB);
  const objectsAfterB = await adminObjects(config, prefixB);

  check(
    "other_account_untouched",
    afterB.sessions === beforeB.sessions &&
      afterB.cards === beforeB.cards &&
      afterB.journal === beforeB.journal &&
      afterB.profiles === beforeB.profiles &&
      objectsAfterB.length === objectsBeforeB.length,
    `rows ${beforeB.sessions}/${beforeB.cards}/${beforeB.journal}/${beforeB.profiles} -> ${afterB.sessions}/${afterB.cards}/${afterB.journal}/${afterB.profiles}; objects ${objectsBeforeB.length} -> ${objectsAfterB.length}`,
  );

  // 6. The session-to-card cascade: deleting one of B's sessions takes its card with it.
  const removed = await request(config, `/rest/v1/sessions?id=eq.${idsB[0]}`, { method: "DELETE", as: { token: accountB.token } });
  const afterCascade = await countsFor(config, accountB, idsB);

  check(
    "cascade_removes_cards",
    removed.status === 204 && afterCascade.sessions === 2 && afterCascade.cards === 2,
    `sessions=${afterCascade.sessions} cards=${afterCascade.cards}`,
  );

  // 7. A repeat run is safe.
  const repeat = await deleteEverything({
    storage: httpStorageClient({ baseUrl: config.baseUrl, bucket: BUCKET, anonKey: config.anonKey, accessToken: accountA.token }),
    prefix: prefixA,
    deleteRows: appRowsDeleter(credentials),
    checkAccount: async () => ({ present: true, detail: "not reached" }),
  });

  check("repeat_is_safe", repeat.ok === true && repeat.storage.deleted === 0, `deleted=${repeat.storage.deleted}`);

  // 8. Leave the local stack as it was found.
  const adminStorage = httpStorageClient({
    baseUrl: config.baseUrl,
    bucket: BUCKET,
    anonKey: config.anonKey,
    accessToken: config.serviceKey,
  });

  const clearedA = await clearPrefix(adminStorage, prefixA);
  const clearedB = await clearPrefix(adminStorage, prefixB);

  await deleteAccount(config, accountA.userId);
  await deleteAccount(config, accountB.userId);

  const leftovers = [...(await adminObjects(config, prefixA)), ...(await adminObjects(config, prefixB))];

  check("cleanup_left_no_objects", clearedA.remaining === 0 && clearedB.remaining === 0 && leftovers.length === 0);

  const ok = Object.values(assertions).every(Boolean);

  writeFileSync(EVIDENCE_FILE, `${JSON.stringify({ ok, ranAt: new Date().toISOString(), assertions }, null, 2)}\n`, "utf8");

  console.log("");
  console.log(`${ok ? "PASS" : "FAIL"}  ${Object.values(assertions).filter(Boolean).length}/${Object.keys(assertions).length} assertions`);
  console.log("evidence written to supabase/tests/delete-everything-evidence.json");

  return ok ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`FAIL  the run threw: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
