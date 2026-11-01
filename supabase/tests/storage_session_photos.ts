/**
 * SomaMap storage behavioural security test - private bucket `session-photos`.
 * supabase/tests/storage_session_photos.ts
 *
 * WHAT THIS PROVES (behaviour, not configuration)
 *   With two disposable accounts obtained from the LOCAL Auth API (genuine sessions):
 *     S1  user A can upload a file into their own folder
 *     S2  user A can read their own file back, byte for byte
 *     S3  user B can upload a file into their own folder
 *     S4  user B can read their own file back, byte for byte
 *     S5  user A cannot read user B's file
 *     S6  user A cannot overwrite user B's file (and B's bytes are unchanged)
 *     S7  user A cannot delete user B's file (and B's file is still readable)
 *     S8  user A cannot upload into user B's folder (and B's folder stays clean)
 *     S9  an anonymous request cannot read a private file
 *     S10 an anonymous request cannot upload
 *     S11 an invalid token is rejected as an AUTH failure, not as a policy denial
 *     S12 user A's own file survives every denial above
 *     S13 A's bulk delete of B's object (exact name) reports nothing deleted and removes nothing
 *   S7 and S13 are each preceded by owner-side controls (S7ctl1-3, S13ctl1-3) that prove the same
 *   single-object and exact-name bulk delete operations succeed on a disposable object of the acting
 *   user's own, so a denied cross-user delete is evidence of policy enforcement rather than of a
 *   request shape the service does not honour. Those controls never use the service key, and the
 *   bulk control only passes when the re-listed prefix is empty.
 *   Then cleanup (C1A..C4): every object this run created is gone, both disposable accounts are
 *   gone, and nothing outside this run's own folders was touched.
 *
 * EVIDENCE DISCIPLINE (a generic HTTP error is not proof)
 *   Every denial assertion is paired with a positive control that uses the SAME request shape
 *   (same URL, same method, same headers) and only a different identity or path, so a pass
 *   cannot come from a broken URL, a wrong method or a network problem. Responses are
 *   classified from the status AND the error body:
 *     ok            2xx
 *     policy-denied 400/403/404 carrying a row-level-security, not-found or access-denied signal
 *                   (`AccessDenied` + "row-level security" for insert/update violations, `NoSuchKey`
 *                   for a row the caller's policies hide, `AccessDenied` + "Access denied" when an
 *                   existing row may not be deleted by this caller)
 *     auth-failure  400/401/403 carrying a JWT/token signal (observed: "Invalid Compact JWS")
 *     redirect      a 3xx or opaque redirect: never followed, always a failure
 *     server-error  5xx          network-error  fetch threw
 *     other         anything else - reported as a failure, never as a pass
 *   Redirects are refused at the transport level (`redirect: "manual"`), so a 3xx can never carry a
 *   request, or a credential, to a host the loopback guard never validated.
 *   Response parsing is strict: a malformed or unexpectedly shaped successful body is never read as
 *   an empty result, and it fails the assertion or cleanup check that depends on it.
 *   Authentication is evaluated before policy wording (`classify`), so a response carrying both an
 *   auth signal and a policy phrase is reported as an authentication failure - the fail-closed
 *   direction - and only one category ever decides an assertion.
 *   Measured on this stack: a hidden row answers `400 NoSuchKey` whether it exists or not, so
 *   the only honest proof of "A cannot read B's file" is that B reads that very path
 *   successfully while A does not. That pairing is what these assertions require.
 *
 * LOCAL-ONLY, FAIL-CLOSED
 *   * The target must be loopback (127.0.0.1 / localhost / ::1). The default is derived from
 *     supabase/config.toml [api] port; SOMAMAP_LOCAL_SUPABASE_URL may override it, but a
 *     non-loopback value aborts the run before a single request is sent.
 *   * This file deliberately does NOT read .env.local: that file currently points at the
 *     hosted project (a https://<ref>.supabase.co URL with a hosted service_role key), and
 *     this test must never touch it. Keys come from the local stack's own generated secrets
 *     (supabase/.temp/start-secrets/.../env/docker.env, gitignored) or from
 *     SOMAMAP_LOCAL_ANON_KEY / SOMAMAP_LOCAL_SERVICE_ROLE_KEY.
 *   * Both keys must be the local demo keys (JWT `iss` = "supabase-demo"); a key with any
 *     other issuer aborts the run.
 *
 * IDENTITY RULES
 *   * Accounts are created with POST /auth/v1/signup and used through the access token the
 *     local Auth API issues. No JWT is forged, nothing is written into auth.users, and the
 *     service key is never used as a test identity.
 *   * The local service key is used only for admin-side cleanup and the leftover scan, because
 *     this GoTrue build answers DELETE /auth/v1/user with 405 (no self-deletion).
 *
 * ACCESS MODES
 *   Every request states who it is made as: `asOwner(session)` attaches the caller's own token,
 *   `ANONYMOUS_ACCESS` sends no Authorization header at all, and `ADMIN_ACCESS` attaches the local
 *   service key. There is no default - the helpers that can act with more than one identity require
 *   an explicit mode, so no call site can reach the admin credential by leaving an argument out.
 *   Admin mode is used only by the disposable-account helpers and by the cleanup sweep and
 *   post-account-deletion verification, which cannot run as a user.
 *
 * PATHS AND CLEANUP
 *   Every object lives at `<uid>/rls-storage-test-<run>/<name>`: the FIRST path segment must be
 *   the caller's uid, which is exactly what the insert policy checks with
 *   `(storage.foldername(name))[1] = auth.jwt() ->> 'sub'`. Because each run uses brand-new uids and
 *   a fresh run tag, no pre-existing object can be overwritten or deleted, and cleanup only ever
 *   addresses those two prefixes. Cleanup runs in a `finally` block, is verified by re-listing, and
 *   is reported even when an assertion fails.
 *   Deletion is by EXACT object name, never by folder prefix: the bulk endpoint resolves its
 *   `prefixes` entries as names (storage-api `deleteObjects` -> `findObjectTargets({ names })`), so a
 *   folder path matches nothing and answers 200 while deleting nothing. The harness therefore walks
 *   the prefix recursively with the list API, skips folder placeholders, refuses any name that
 *   escapes the prefix, deletes the collected names in batches, and re-lists to prove the prefix is
 *   empty - a 200 response alone can never count as a successful deletion. C4 verifies the same way,
 *   recursively, so deeply nested residue is detected.
 *   The pre-flight emptiness check (S0c) fails closed: if a run prefix already holds an object, or
 *   cannot be listed, the matrix does not start and that prefix is never deleted - only the
 *   disposable accounts are cleaned up.
 *
 * ASSERTION MANIFEST
 *   REQUIRED_ASSERTION_IDS lists every assertion that must run exactly once. The final gate reports
 *   PASSED only when every required assertion ran and passed, every cleanup check passed, and there
 *   is no missing, duplicated, malformed or unrecognized id and no diagnostic id. A skipped matrix
 *   therefore can never be reported as a pass.
 *
 * RUN (project root):
 *   node supabase/tests/storage_session_photos.ts
 *
 * Exit codes: 0 = every required assertion passed and cleanup is verified; 1 = an assertion, a
 * cleanup step or the manifest check failed; 2 = the run was blocked (bad target, missing local
 * keys, no disposable session).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUCKET = "session-photos";
const RUN_TAG = "rls-storage-test";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

type Config = { baseUrl: string; anonKey: string; serviceKey: string };

/** Reads KEY=VALUE lines, ignoring blanks and comments. Never logs what it reads. */
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

/** The local stack's own generated secrets (gitignored via supabase/.gitignore). */
function readLocalSecrets(): Record<string, string> {
  const base = join(PROJECT_ROOT, "supabase", ".temp", "start-secrets");
  const merged: Record<string, string> = {};
  if (!existsSync(base)) return merged;
  for (const service of readdirSync(base)) {
    Object.assign(merged, readEnvFile(join(base, service, "env", "docker.env")));
  }
  return merged;
}

/** The local API port, so the harness never has to trust a URL from anywhere else. */
function readApiPort(): string {
  const configPath = join(PROJECT_ROOT, "supabase", "config.toml");
  if (!existsSync(configPath)) throw new Error(`missing ${configPath}`);
  const match = /\[api\][\s\S]*?\n\s*port\s*=\s*(\d+)/.exec(readFileSync(configPath, "utf8"));
  if (!match) throw new Error("could not read the [api] port from supabase/config.toml");
  return match[1];
}

/** JWT payload metadata only - never the signature, never the token itself. */
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

function resolveConfig(): Config {
  const baseUrl = process.env.SOMAMAP_LOCAL_SUPABASE_URL ?? `http://127.0.0.1:${readApiPort()}`;
  const host = new URL(baseUrl).hostname;
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `BLOCKED: target host is not loopback (${host}). This test only runs against the local Supabase stack.`,
    );
  }

  const secrets = readLocalSecrets();
  const anonKey = process.env.SOMAMAP_LOCAL_ANON_KEY ?? secrets.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SOMAMAP_LOCAL_SERVICE_ROLE_KEY ?? secrets.SUPABASE_SERVICE_ROLE_KEY;

  if (!anonKey) {
    throw new Error(
      "BLOCKED: no local anon key. Start the local stack (it writes supabase/.temp/start-secrets/.../docker.env) or set SOMAMAP_LOCAL_ANON_KEY.",
    );
  }
  if (!serviceKey) {
    throw new Error(
      "BLOCKED: no local service key, which disposable-account cleanup needs (this GoTrue build has no self-delete). Start the local stack or set SOMAMAP_LOCAL_SERVICE_ROLE_KEY.",
    );
  }
  for (const [name, key] of [["anon", anonKey], ["service", serviceKey]] as const) {
    const issuer = jwtIssuer(key);
    if (issuer !== "supabase-demo") {
      throw new Error(
        `BLOCKED: the ${name} key is not a local demo key (issuer ${issuer ?? "unreadable"}). Refusing to send a non-local credential anywhere.`,
      );
    }
  }
  return { baseUrl, anonKey, serviceKey };
}

// ---------------------------------------------------------------------------
// HTTP layer. Headers, tokens and response bodies are never logged.
// ---------------------------------------------------------------------------

type Probe = {
  status: number;
  body: string;
  networkError: string | null;
  /** Host of a Location header when the service answered with a redirect, else null. Never the full URL. */
  redirectHost: string | null;
};
type Outcome =
  | "ok"
  | "policy-denied"
  | "auth-failure"
  | "server-error"
  | "network-error"
  | "redirect"
  | "other";

type RequestOptions = {
  contentType?: string;
  body?: string;
  headers?: Record<string, string>;
};

/**
 * Who a request is made as. Every helper that can act with more than one identity takes this
 * explicitly, so no call site can escalate by leaving an argument out:
 *   owner      the caller's own access token - every security assertion and owner-side control
 *   anonymous  no Authorization header at all - the anonymous assertions
 *   admin      the local service key - reserved for cleanup and verification steps that cannot run
 *              as a user (the post-deletion account sweep and the verification after the accounts
 *              are gone), never for an owner-side assertion
 */
type OwnerAccess = { as: "owner"; token: string };
type AnonymousAccess = { as: "anonymous" };
type AdminAccess = { as: "admin" };
type StorageAccess = OwnerAccess | AnonymousAccess | AdminAccess;

/** The access mode for a request made with a user's genuine session. */
function asOwner(session: Session): OwnerAccess {
  return { as: "owner", token: session.token };
}

/** No session at all: the request carries only the publishable key. */
const ANONYMOUS_ACCESS: AnonymousAccess = { as: "anonymous" };

/** The local admin credential. Cleanup and verification only - never an owner-side assertion. */
const ADMIN_ACCESS: AdminAccess = { as: "admin" };

/** Maps an explicit access mode to request headers: the one place a credential is attached. */
function accessHeaders(cfg: Config, access: StorageAccess): Record<string, string> {
  if (access.as === "admin") {
    return { apikey: cfg.serviceKey, authorization: `Bearer ${cfg.serviceKey}` };
  }
  if (access.as === "anonymous") {
    return { apikey: cfg.anonKey };
  }
  return { apikey: cfg.anonKey, authorization: `Bearer ${access.token}` };
}

/**
 * Host of a Location header, for evidence only. Only the hostname is kept, so a token or query
 * string in a redirect target can never be printed.
 */
function locationHost(location: string | null, baseUrl: string): string {
  if (!location) return "<no location header>";
  try {
    return new URL(location, baseUrl).hostname;
  } catch {
    return "<unparseable location>";
  }
}

async function http(
  cfg: Config,
  method: string,
  path: string,
  access: StorageAccess,
  options: RequestOptions = {},
): Promise<Probe> {
  const headers: Record<string, string> = accessHeaders(cfg, access);
  if (options.contentType) headers["content-type"] = options.contentType;
  Object.assign(headers, options.headers ?? {});

  try {
    const response = await fetch(cfg.baseUrl + path, {
      method,
      headers,
      body: options.body,
      // Never follow a redirect: a 3xx could point away from the validated loopback host.
      redirect: "manual",
    });
    const redirected = (response.status >= 300 && response.status < 400) || response.type === "opaqueredirect";
    return {
      status: response.status,
      body: await response.text(),
      networkError: null,
      redirectHost: redirected ? locationHost(response.headers.get("location"), cfg.baseUrl) : null,
    };
  } catch (error) {
    return {
      status: 0,
      body: "",
      networkError: error instanceof Error ? error.message : String(error),
      redirectHost: null,
    };
  }
}

/** The error code the service reported, without the rest of the body. */
function errorCode(probe: Probe): string {
  try {
    const parsed = JSON.parse(probe.body) as Record<string, unknown>;
    for (const key of ["code", "error", "statusCode"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.length > 0) return value.slice(0, 40);
    }
    return "<none>";
  } catch {
    return probe.body.length === 0 ? "<empty>" : "<non-json>";
  }
}

function signals(probe: Probe): { rls: boolean; notFound: boolean; accessDenied: boolean; auth: boolean } {
  const text = probe.body.toLowerCase();
  return {
    rls: /row-level security/.test(text),
    notFound: /no[_ ]?such|not[_ ]?found|does not exist/.test(text),
    // Storage's own permission wording, measured on the pinned storage-api v1.84.19: a single-object
    // delete of an EXISTING row the caller may not touch answers `400 AccessDenied` with the literal
    // message "Access denied" - distinct from its authentication wording ("Invalid Compact JWS",
    // which carries no such phrase). Without this signal a genuine policy denial was classified
    // "other" and the assertion was refused.
    accessDenied: /access denied/.test(text),
    auth: /jwt|jws|token|authorization|signature/.test(text),
  };
}

/**
 * Classifies a response from its status plus body signals. A 4xx with no recognisable signal
 * is "other" and can never satisfy a denial assertion, so a bare HTTP error is not accepted
 * as proof of a policy denial.
 */
function classify(probe: Probe): Outcome {
  if (probe.networkError) return "network-error";
  // A redirect was refused at the transport level (redirect: "manual"), so it is a failure, not a result.
  if (probe.redirectHost !== null) return "redirect";
  if (probe.status >= 500) return "server-error";
  if (probe.status >= 200 && probe.status < 300) return "ok";
  if (probe.status === 401) return "auth-failure";
  if (probe.status === 400 || probe.status === 403 || probe.status === 404) {
    const found = signals(probe);
    // Authentication is evaluated FIRST: an explicit auth failure outranks any policy wording, so a
    // response carrying both cannot be accepted as proof of a policy denial (fail-closed ordering).
    if (found.auth) return "auth-failure";
    if (found.rls || found.notFound || found.accessDenied) return "policy-denied";
    return "other";
  }
  return "other";
}

/**
 * The signal categories a body matched, as safe labels - never the matched words, the message, or the
 * body itself. One source of truth for evidence lines, so service wording can never be echoed into the
 * log. Derived from `signals()`, so no regex is repeated.
 */
function matchedSignals(probe: Probe): string {
  const found = signals(probe);
  return (
    [
      found.rls ? "rls" : "",
      found.notFound ? "not-found" : "",
      found.accessDenied ? "access-denied" : "",
      found.auth ? "auth-signal" : "",
    ]
      .filter(Boolean)
      .join("+") || "no-signal"
  );
}

/** One line of evidence: status, error code, and which signals the body carried. */
function evidence(probe: Probe): string {
  if (probe.networkError) return `network-error: ${probe.networkError.slice(0, 60)}`;
  if (probe.redirectHost !== null) {
    return `redirect-refused: status=${probe.status} location_host=${probe.redirectHost}`;
  }
  return `status=${probe.status} code=${errorCode(probe)} signals=${matchedSignals(probe)}`;
}

type ParsedJson = { ok: boolean; value: unknown };

/** Strict JSON parse: `ok` is false for an empty or malformed body. */
function parseJson(probe: Probe): ParsedJson {
  try {
    return { ok: true, value: JSON.parse(probe.body) as unknown };
  } catch {
    return { ok: false, value: null };
  }
}

const HARD_FAILURE_OUTCOMES: ReadonlySet<Outcome> = new Set<Outcome>(["network-error", "server-error", "redirect"]);

/**
 * True when a response cannot be used as evidence at all: no reply, a server fault, or a redirect
 * this harness refused to follow.
 */
function isHardFailure(probe: Probe): boolean {
  return HARD_FAILURE_OUTCOMES.has(classify(probe));
}

/** A listing entry: `isFolder` is true for storage's folder placeholders (no string `id`). */
type ListEntry = { name: string; isFolder: boolean };

/**
 * Strict parser for a storage list response. `ok` is false when the body is not a JSON array of
 * objects each carrying a non-empty `name`, so a malformed success can never look like an empty
 * folder. Folder placeholders are recognised by a missing or null `id`.
 */
function listedEntries(probe: Probe): { ok: boolean; entries: ListEntry[] } {
  const parsed = parseJson(probe);
  if (!parsed.ok || !Array.isArray(parsed.value)) return { ok: false, entries: [] };

  const entries: ListEntry[] = [];
  for (const item of parsed.value) {
    if (item === null || typeof item !== "object") return { ok: false, entries: [] };
    const name = (item as { name?: unknown }).name;
    if (typeof name !== "string" || name.length === 0) return { ok: false, entries: [] };
    const id = (item as { id?: unknown }).id;
    entries.push({ name, isFolder: !(typeof id === "string" && id.length > 0) });
  }
  return { ok: true, entries };
}

/**
 * Object and folder names in a listing, exactly as the service reports them (folders included,
 * because a non-recursive listing reports subfolders as placeholders).
 */
function listedNames(probe: Probe): { ok: boolean; names: string[] } {
  const parsed = listedEntries(probe);
  if (!parsed.ok) return { ok: false, names: [] };
  return { ok: true, names: parsed.entries.map((entry) => entry.name) };
}

/**
 * The paths a bulk-delete response reports as deleted. `ok` is false when the body is not a JSON
 * array of path strings (or objects carrying a `name`), so a malformed success can never look like
 * "nothing was deleted".
 */
function reportedDeleted(probe: Probe): { ok: boolean; paths: string[] } {
  const parsed = parseJson(probe);
  if (!parsed.ok || !Array.isArray(parsed.value)) return { ok: false, paths: [] };

  const paths: string[] = [];
  for (const item of parsed.value) {
    if (typeof item === "string") {
      paths.push(item);
      continue;
    }
    if (item !== null && typeof item === "object") {
      const name = (item as { name?: unknown }).name;
      if (typeof name === "string" && name.length > 0) {
        paths.push(name);
        continue;
      }
    }
    return { ok: false, paths: [] };
  }
  return { ok: true, paths };
}

// ---------------------------------------------------------------------------
// Result bookkeeping.
// ---------------------------------------------------------------------------

type Result = { id: string; label: string; ok: boolean; evidence: string };
const results: Result[] = [];
const ID_WIDTH = 5;
const LABEL_WIDTH = 54;

function record(id: string, label: string, ok: boolean, detail: string): boolean {
  results.push({ id, label, ok, evidence: detail });
  console.log(`${(ok ? "PASS" : "FAIL").padEnd(6)}${id.padEnd(ID_WIDTH)}${label.padEnd(LABEL_WIDTH)}${detail}`);
  return ok;
}

/** Why an unacceptable denial outcome cannot be used as evidence. */
function denialFailureReason(outcome: Outcome, rule: "policy" | "policy-or-auth"): string {
  if (outcome === "ok") return "the request SUCCEEDED - this is a security failure";
  if (outcome === "redirect") return "the service answered with a redirect, which this harness refuses to follow";
  if (outcome === "auth-failure" && rule === "policy") {
    return "rejected as an authentication failure although the session is valid";
  }
  if (outcome === "other") {
    return "a 4xx with no row-level-security, not-found or access-denied signal - not usable as proof";
  }
  return `unexpected outcome (${outcome})`;
}

/**
 * Records a denial assertion. `rule` says what kind of denial is acceptable:
 *   "policy"          the caller held a valid session, so an auth failure would be wrong
 *   "policy-or-auth"  the caller had no usable session at all (anonymous)
 */
function recordDenial(
  id: string,
  label: string,
  probe: Probe,
  rule: "policy" | "policy-or-auth",
  note: string,
): boolean {
  const outcome = classify(probe);
  const acceptable =
    rule === "policy" ? outcome === "policy-denied" : outcome === "policy-denied" || outcome === "auth-failure";
  const detail = `${evidence(probe)}${note.length > 0 ? ` | ${note}` : ""}`;

  if (!acceptable) {
    return record(id, label, false, `${detail} | ${denialFailureReason(outcome, rule)}`);
  }
  return record(id, label, true, `${detail} | ${outcome}`);
}

/** Records an assertion whose evidence is not an HTTP response (survival checks, counts). */
function recordState(id: string, label: string, ok: boolean, detail: string): boolean {
  return record(id, label, ok, detail);
}

// ---------------------------------------------------------------------------
// Auth helpers (genuine local sessions only).
// ---------------------------------------------------------------------------

type Session = { userId: string; token: string; label: string };

async function signUpDisposable(cfg: Config, label: string, email: string, password: string): Promise<Session> {
  const probe = await http(cfg, "POST", "/auth/v1/signup", ANONYMOUS_ACCESS, {
    contentType: "application/json",
    body: JSON.stringify({ email, password }),
  });
  if (classify(probe) !== "ok") {
    throw new Error(
      `BLOCKED: local signup for ${label} failed (${evidence(probe)}). Disposable account creation is required; this harness will not bypass authentication.`,
    );
  }
  const parsed = JSON.parse(probe.body) as { access_token?: string; user?: { id?: string } };
  const token = parsed.access_token;
  const userId = parsed.user?.id;
  if (!token || !userId) {
    throw new Error(
      `BLOCKED: local signup for ${label} returned no access token or no user id, so no genuine session exists. Refusing to continue.`,
    );
  }
  return { userId, token, label };
}

async function adminDeleteUser(cfg: Config, userId: string): Promise<Probe> {
  return http(cfg, "DELETE", `/auth/v1/admin/users/${userId}`, ADMIN_ACCESS);
}

async function adminGetUser(cfg: Config, userId: string): Promise<Probe> {
  return http(cfg, "GET", `/auth/v1/admin/users/${userId}`, ADMIN_ACCESS);
}

// ---------------------------------------------------------------------------
// Storage helpers. Every helper states its access mode explicitly: `upload` and `deleteObject`
// require a session, `uploadAnonymous` is anonymous by name, and the helpers that can act with more
// than one identity take a StorageAccess value that the call site must choose.
// ---------------------------------------------------------------------------

function objectPath(session: Session, runTag: string, name: string): string {
  return `${session.userId}/${RUN_TAG}-${runTag}/${name}`;
}

function folderPrefix(session: Session, runTag: string): string {
  return `${session.userId}/${RUN_TAG}-${runTag}/`;
}

async function upload(
  cfg: Config,
  session: Session,
  path: string,
  content: string,
  upsert: boolean,
): Promise<Probe> {
  return http(cfg, "POST", `/storage/v1/object/${BUCKET}/${path}`, asOwner(session), {
    contentType: "text/plain",
    body: content,
    headers: upsert ? { "x-upsert": "true" } : {},
  });
}

async function uploadAnonymous(cfg: Config, path: string, content: string): Promise<Probe> {
  return http(cfg, "POST", `/storage/v1/object/${BUCKET}/${path}`, ANONYMOUS_ACCESS, {
    contentType: "text/plain",
    body: content,
  });
}

/** Read through the authenticated object route, as the owner or anonymously - never with the admin key. */
async function download(cfg: Config, path: string, access: OwnerAccess | AnonymousAccess): Promise<Probe> {
  return http(cfg, "GET", `/storage/v1/object/authenticated/${BUCKET}/${path}`, access);
}

async function deleteObject(cfg: Config, session: Session, path: string): Promise<Probe> {
  return http(cfg, "DELETE", `/storage/v1/object/${BUCKET}/${path}`, asOwner(session));
}

/** Listing page size; the enumerator below pages with this value. */
const LIST_PAGE_SIZE = 100;

/**
 * A single bulk-delete request. The bulk endpoint resolves every entry as an EXACT object name
 * (storage-api `deleteObjects` -> `findObjectTargets({ names })`), never as a folder prefix, so
 * only names produced by the recursive enumeration below may be passed to it.
 */
async function bulkDeleteNames(cfg: Config, names: readonly string[], access: StorageAccess): Promise<Probe> {
  return http(cfg, "DELETE", `/storage/v1/object/${BUCKET}`, access, {
    contentType: "application/json",
    body: JSON.stringify({ prefixes: names }),
  });
}

/** One page of a listing, in the caller's stated access mode. */
async function listPrefixPage(
  cfg: Config,
  prefix: string,
  offset: number,
  access: StorageAccess,
): Promise<Probe> {
  return http(cfg, "POST", `/storage/v1/object/list/${BUCKET}`, access, {
    contentType: "application/json",
    body: JSON.stringify({ prefix, limit: LIST_PAGE_SIZE, offset }),
  });
}

/** The first page of a listing - the shape the assertion call sites use. */
async function listPrefix(cfg: Config, prefix: string, access: StorageAccess): Promise<Probe> {
  return listPrefixPage(cfg, prefix, 0, access);
}

// ---------------------------------------------------------------------------
// Recursive, confined enumeration and verified exact-name deletion.
//
// The list API is non-recursive and reports subfolders as folder placeholders, and the bulk delete
// endpoint deletes exact object names - never folders. Deleting a "prefix" therefore has to be:
// enumerate the files under it, recurse into placeholders, refuse any name that escapes the prefix,
// delete those exact names in batches, then enumerate again to prove the prefix is empty. A 200
// response alone can never satisfy this: only the empty re-listing can.
// ---------------------------------------------------------------------------

const ENUMERATION_MAX_PAGES_PER_FOLDER = 50;
const ENUMERATION_MAX_DEPTH = 8;
const ENUMERATION_MAX_OBJECTS = 5000;
const DELETE_BATCH_SIZE = 100;

/** True when `name` is a real object strictly inside `prefix` and cannot escape it. */
function isConfinedToPrefix(name: string, prefix: string): boolean {
  return (
    prefix.length > 0 &&
    name.startsWith(prefix) &&
    name.length > prefix.length &&
    !name.startsWith("/") &&
    !name.includes("..") &&
    !name.includes("//")
  );
}

type EnumerationResult = { ok: boolean; names: string[]; detail: string };

/**
 * Recursively enumerates the object names under `prefix`. Folder placeholders are walked, never
 * collected as deletion targets; every collected name must stay inside `prefix` or the walk fails
 * closed. `access` states the mode explicitly: owner for the run's own assertions, admin only for
 * cleanup and verification.
 */
async function enumerateObjectsUnderPrefix(
  cfg: Config,
  prefix: string,
  access: StorageAccess,
): Promise<EnumerationResult> {
  const names: string[] = [];
  const folders: string[] = [prefix];
  let pages = 0;
  let folderCount = 0;

  while (folders.length > 0) {
    const folder = folders.shift() as string;
    folderCount += 1;
    if (folder.split("/").length - 1 > ENUMERATION_MAX_DEPTH) {
      return { ok: false, names: [], detail: `depth limit ${ENUMERATION_MAX_DEPTH} exceeded below ${prefix}` };
    }

    let offset = 0;
    let more = true;
    for (let page = 0; more; page += 1) {
      if (page >= ENUMERATION_MAX_PAGES_PER_FOLDER) {
        return {
          ok: false,
          names: [],
          detail: `page limit ${ENUMERATION_MAX_PAGES_PER_FOLDER} reached below ${prefix}`,
        };
      }

      const probe = await listPrefixPage(cfg, folder, offset, access);
      pages += 1;
      if (classify(probe) !== "ok") {
        return { ok: false, names: [], detail: `listing failed below ${prefix}: ${evidence(probe)}` };
      }
      const parsed = listedEntries(probe);
      if (!parsed.ok) {
        return {
          ok: false,
          names: [],
          detail: `listing below ${prefix} returned an unexpected shape: ${evidence(probe)}`,
        };
      }

      for (const entry of parsed.entries) {
        const full = `${folder}${entry.name}`;
        if (entry.isFolder) {
          const child = `${full}/`;
          if (!isConfinedToPrefix(child, prefix)) {
            return { ok: false, names: [], detail: `a folder entry escaped the run prefix below ${prefix}` };
          }
          folders.push(child);
          continue;
        }
        if (!isConfinedToPrefix(full, prefix)) {
          return { ok: false, names: [], detail: `an object entry escaped the run prefix below ${prefix}` };
        }
        names.push(full);
        if (names.length > ENUMERATION_MAX_OBJECTS) {
          return { ok: false, names: [], detail: `object limit ${ENUMERATION_MAX_OBJECTS} exceeded below ${prefix}` };
        }
      }

      if (parsed.entries.length < LIST_PAGE_SIZE) more = false;
      else offset += LIST_PAGE_SIZE;
    }
  }

  return { ok: true, names, detail: `objects=${names.length} folders=${folderCount} pages=${pages}` };
}

type BulkDeleteResult = { ok: boolean; deleted: string[]; detail: string };

/**
 * Deletes the given exact object names in batches. Only names produced by the enumeration above may
 * be passed, and every batch must answer with a well-formed JSON array of deleted names.
 */
async function deleteExactNames(
  cfg: Config,
  names: readonly string[],
  access: StorageAccess,
): Promise<BulkDeleteResult> {
  const deleted: string[] = [];
  let batches = 0;

  for (let index = 0; index < names.length; index += DELETE_BATCH_SIZE) {
    const batch = names.slice(index, index + DELETE_BATCH_SIZE);
    const probe = await bulkDeleteNames(cfg, batch, access);
    batches += 1;
    if (classify(probe) !== "ok") {
      return { ok: false, deleted, detail: `batch ${batches} was not a success: ${evidence(probe)}` };
    }
    const reported = reportedDeleted(probe);
    if (!reported.ok) {
      return { ok: false, deleted, detail: `batch ${batches} returned an unexpected shape: ${evidence(probe)}` };
    }
    deleted.push(...reported.paths);
  }

  return { ok: true, deleted, detail: `batches=${batches} deleted_reported=${deleted.length}` };
}

type PrefixDeleteResult = {
  ok: boolean;
  enumerated: number;
  deleted: number;
  remaining: number;
  detail: string;
};

/**
 * Enumerates every object under `prefix`, deletes those exact names, then re-enumerates and requires
 * an empty prefix - so a 200 delete response alone can never count as a successful deletion.
 * `access` states the mode explicitly: owner for the run's own cleanup path, admin only for the
 * post-deletion sweep.
 */
async function deleteEverythingUnderPrefix(
  cfg: Config,
  prefix: string,
  access: StorageAccess,
): Promise<PrefixDeleteResult> {
  const before = await enumerateObjectsUnderPrefix(cfg, prefix, access);
  if (!before.ok) {
    return { ok: false, enumerated: 0, deleted: 0, remaining: -1, detail: `enumeration failed: ${before.detail}` };
  }

  let deleted = 0;
  if (before.names.length > 0) {
    const removal = await deleteExactNames(cfg, before.names, access);
    if (!removal.ok) {
      return {
        ok: false,
        enumerated: before.names.length,
        deleted: removal.deleted.length,
        remaining: -1,
        detail: removal.detail,
      };
    }
    deleted = removal.deleted.length;
  }

  const after = await enumerateObjectsUnderPrefix(cfg, prefix, access);
  if (!after.ok) {
    return {
      ok: false,
      enumerated: before.names.length,
      deleted,
      remaining: -1,
      detail: `verification enumeration failed: ${after.detail}`,
    };
  }

  return {
    ok: after.names.length === 0,
    enumerated: before.names.length,
    deleted,
    remaining: after.names.length,
    detail: `enumerated=${before.names.length} deleted_reported=${deleted} remaining=${after.names.length} | ${after.detail}`,
  };
}

// ---------------------------------------------------------------------------
// Cleanup. Runs in a `finally` block, so it happens on success and on failure.
// Only ever addresses this run's own two prefixes and this run's own accounts.
// ---------------------------------------------------------------------------

async function cleanup(
  cfg: Config,
  sessions: Session[],
  runTag: string,
  unsafePrefixes: ReadonlySet<string>,
): Promise<boolean> {
  let ok = true;

  // C1: each owner deletes its own run folder, then proves it is empty. A prefix that failed its
  // pre-flight emptiness check is never deleted: whatever it holds is not demonstrably ours.
  for (const session of sessions) {
    const prefix = folderPrefix(session, runTag);

    if (unsafePrefixes.has(prefix)) {
      const listed = await listPrefix(cfg, prefix, asOwner(session));
      const found = listedNames(listed);
      ok =
        recordState(
          `C1${session.label}`,
          `${session.label}'s run folder was NOT deleted (prefix failed its emptiness check)`,
          false,
          `${evidence(listed)} | objects left untouched=${found.names.length} (parse_ok=${found.ok})`,
        ) && ok;
      continue;
    }

    const removal = await deleteEverythingUnderPrefix(cfg, prefix, asOwner(session));
    ok =
      recordState(
        `C1${session.label}`,
        `${session.label} deleted its own run folder (exact names, re-listed empty)`,
        removal.ok,
        removal.detail,
      ) && ok;
  }

  // C2: admin-side sweep of the prefixes that passed their emptiness check, so a failed owner
  // delete cannot leave an object behind. An unsafe prefix is never swept.
  for (const session of sessions) {
    const prefix = folderPrefix(session, runTag);

    if (unsafePrefixes.has(prefix)) {
      ok =
        recordState(
          `C2${session.label}`,
          `admin sweep skipped for ${session.label} (prefix failed its emptiness check)`,
          false,
          "no object under this prefix was created by this run, so nothing was deleted",
        ) && ok;
      continue;
    }

    // Admin mode is required here: this sweep runs after the owner delete failed or was skipped, and
    // it is confined to a prefix the pre-flight proved was this run's own.
    const removal = await deleteEverythingUnderPrefix(cfg, prefix, ADMIN_ACCESS);
    ok =
      recordState(
        `C2${session.label}`,
        "admin sweep left no object under the run prefix (exact names, re-listed empty)",
        removal.ok,
        removal.detail,
      ) && ok;
  }

  // C3: the disposable accounts are deleted and confirmed gone. These are always this run's own.
  for (const session of sessions) {
    const removed = await adminDeleteUser(cfg, session.userId);
    const lookup = await adminGetUser(cfg, session.userId);
    const gone = lookup.status === 404;
    ok =
      recordState(
        `C3${session.label}`,
        `${session.label}'s disposable account is gone`,
        !isHardFailure(removed) && gone,
        `${evidence(removed)} | lookup ${evidence(lookup)}`,
      ) && ok;
  }

  // C4: verified recursive enumeration of this run's own prefixes. The previous bucket-root scan was
  // non-recursive, so it could not see objects nested below the uid folder at all - it reported
  // "this run=0" while residue was still present.
  const safeList = sessions
    .map((session) => folderPrefix(session, runTag))
    .filter((prefix) => !unsafePrefixes.has(prefix));
  const unsafeList = [...unsafePrefixes];

  const safeScans: { prefix: string; result: EnumerationResult }[] = [];
  for (const prefix of safeList) {
    // Admin mode is required: C3 has already deleted the accounts, so no owner session exists here.
    safeScans.push({ prefix, result: await enumerateObjectsUnderPrefix(cfg, prefix, ADMIN_ACCESS) });
  }
  const unsafeScans: { prefix: string; result: EnumerationResult }[] = [];
  for (const prefix of unsafeList) {
    unsafeScans.push({ prefix, result: await enumerateObjectsUnderPrefix(cfg, prefix, ADMIN_ACCESS) });
  }

  const ours = safeScans.flatMap((scan) => scan.result.names);
  const untouched = unsafeScans.flatMap((scan) => scan.result.names);
  const scansOk = safeScans.every((scan) => scan.result.ok) && unsafeScans.every((scan) => scan.result.ok);

  // One bounded, non-recursive root listing, only to report how many other top-level folders exist.
  // Other runs' objects are never walked and never deleted.
  const rootList = await listPrefix(cfg, "", ADMIN_ACCESS);
  const rootNames = listedNames(rootList);
  const ourFolders = [...safeList, ...unsafeList].map((prefix) => prefix.split("/")[0]);
  const otherFolders = rootNames.ok ? rootNames.names.filter((name) => !ourFolders.includes(name)).length : -1;

  ok =
    recordState(
      "C4",
      "no object from this run survives anywhere under its prefixes (recursive)",
      scansOk && ours.length === 0,
      `prefixes walked recursively=${safeList.length + unsafeList.length} | this run=${ours.length} | untouched unsafe prefix=${untouched.length} | other top-level folders not walked=${otherFolders} (never deleted) | ${safeScans.map((scan) => scan.result.detail).join("; ") || "no safe prefix"}`,
    ) && ok;

  return ok;
}

// ---------------------------------------------------------------------------
// Assertion manifest. Success requires exactly this set to have run exactly once each.
// ---------------------------------------------------------------------------

/** Every assertion this harness must run: preflight, matrix, positive controls, cleanup. */
const REQUIRED_ASSERTION_IDS: readonly string[] = [
  // preflight
  "S0a",
  "S0b",
  "S0c",
  // owner path
  "S1",
  "S2",
  "S3",
  "S4",
  // cross-user read
  "S5",
  // cross-user overwrite
  "S6a",
  "S6b",
  "S6c",
  // cross-user single-object delete, with its owner-side controls
  "S7ctl1",
  "S7ctl2",
  "S7ctl3",
  "S7",
  // cross-user upload into the other folder
  "S8a",
  "S8b",
  // anonymous read and anonymous upload
  "S9",
  "S10a",
  "S10b",
  // auth-failure discriminator
  "S11",
  // survival of the owner's own file
  "S12",
  // cross-user bulk delete, with its owner-side controls
  "S13ctl1",
  "S13ctl2",
  "S13ctl3",
  "S13",
  // cleanup
  "C1A",
  "C1B",
  "C2A",
  "C2B",
  "C3A",
  "C3B",
  "C4",
];

/** Ids recorded only when something went wrong; their presence is itself a failure. */
const DIAGNOSTIC_IDS: ReadonlySet<string> = new Set(["X1"]);

type ManifestReport = {
  ok: boolean;
  missing: string[];
  duplicates: string[];
  malformed: string[];
  unrecognized: string[];
  diagnostics: string[];
};

/**
 * Compares the executed ids with the manifest. A missing, duplicated, malformed or unrecognized id
 * - or the presence of a diagnostic id - means the run cannot be reported as a pass, so a skipped
 * matrix can never look like success.
 */
function verifyManifest(executed: readonly string[]): ManifestReport {
  const counts = new Map<string, number>();
  const malformed: string[] = [];

  for (const id of executed) {
    if (!/^[A-Za-z0-9]+$/.test(id)) {
      malformed.push(id);
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const required = new Set<string>(REQUIRED_ASSERTION_IDS);
  const missing = REQUIRED_ASSERTION_IDS.filter((id) => !counts.has(id));
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const unrecognized = [...counts.keys()].filter((id) => !required.has(id) && !DIAGNOSTIC_IDS.has(id));
  const diagnostics = [...counts.keys()].filter((id) => DIAGNOSTIC_IDS.has(id));

  return {
    ok:
      missing.length === 0 &&
      duplicates.length === 0 &&
      malformed.length === 0 &&
      unrecognized.length === 0 &&
      diagnostics.length === 0,
    missing,
    duplicates,
    malformed,
    unrecognized,
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  let cfg: Config;
  try {
    cfg = resolveConfig();
  } catch (error) {
    console.log(`BLOCKED  ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  const runTag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const markerA1 = `A-OWN-${runTag}`;
  const markerA2 = `A-OWN-REPLACED-${runTag}`;
  const markerB = `B-OWN-${runTag}`;
  const markerInjected = `INJECTED-BY-A-${runTag}`;
  const markerAnon = `INJECTED-ANON-${runTag}`;
  const markerScratch = `A-SCRATCH-${runTag}`;

  console.log("SomaMap storage behavioural security test - bucket session-photos");
  console.log(`target: loopback local API only | bucket: ${BUCKET} | run tag: ${runTag}`);
  console.log("identities: disposable accounts created through the local Auth API (no forged JWTs, no auth.users writes)");
  console.log("");

  const sessions: Session[] = [];
  let blocked = false;
  let cleanupOk = false;
  /**
   * Run prefixes that are NOT demonstrably this run's own (a failed or unreadable pre-flight
   * listing). They are never uploaded into after the check fails and never deleted by cleanup.
   */
  const unsafePrefixes = new Set<string>();

  try {
    try {
      sessions.push(
        await signUpDisposable(cfg, "A", `rls-storage-a-${runTag}@example.com`, `Local-only-${runTag}-Aa1`),
      );
      sessions.push(
        await signUpDisposable(cfg, "B", `rls-storage-b-${runTag}@example.com`, `Local-only-${runTag}-Bb2`),
      );
    } catch (error) {
      blocked = true;
      console.log(`BLOCKED  ${error instanceof Error ? error.message : String(error)}`);
      console.log("");
    }

    if (!blocked) {
      const sessionA = sessions[0];
      const sessionB = sessions[1];
      record("S0a", "A holds a genuine local session", true, "signup 200 with an access token and a user id");
      record("S0b", "B holds a genuine local session", true, "signup 200 with an access token and a user id");

      const pathA = objectPath(sessionA, runTag, "own.txt");
      const pathB = objectPath(sessionB, runTag, "own.txt");
      const prefixA = folderPrefix(sessionA, runTag);
      const prefixB = folderPrefix(sessionB, runTag);

      // Pre-flight: each uid is brand new, so its folder must be empty. That is what makes it
      // impossible for this run to overwrite or delete a pre-existing object. A prefix that fails
      // this check - or that cannot be listed at all - is marked unsafe: the matrix does not start,
      // nothing is uploaded into it, and cleanup will not delete it.
      const preA = await listPrefix(cfg, prefixA, asOwner(sessionA));
      const preB = await listPrefix(cfg, prefixB, asOwner(sessionB));
      const preANames = listedNames(preA);
      const preBNames = listedNames(preB);
      const prefixAClean = classify(preA) === "ok" && preANames.ok && preANames.names.length === 0;
      const prefixBClean = classify(preB) === "ok" && preBNames.ok && preBNames.names.length === 0;
      record(
        "S0c",
        "both run folders are empty before the first upload",
        prefixAClean && prefixBClean,
        `A items=${preANames.names.length} (parse_ok=${preANames.ok}) B items=${preBNames.names.length} (parse_ok=${preBNames.ok})`,
      );

      if (!prefixAClean || !prefixBClean) {
        if (!prefixAClean) unsafePrefixes.add(prefixA);
        if (!prefixBClean) unsafePrefixes.add(prefixB);
        console.log(
          "ABORT  the matrix did not start: a run prefix was not empty or could not be listed (fail-closed). Nothing under it will be deleted.",
        );
        throw new Error("preflight failed: a run prefix is not demonstrably this run's own");
      }

      // ---- the owner path must work, or every denial below proves nothing ----
      const uploadA = await upload(cfg, sessionA, pathA, markerA1, false);
      record("S1", "A uploads into A's own folder", classify(uploadA) === "ok", evidence(uploadA));

      const readA = await download(cfg, pathA, asOwner(sessionA));
      record(
        "S2",
        "A reads A's own file, byte for byte",
        classify(readA) === "ok" && readA.body === markerA1,
        `${evidence(readA)} | bytes_match=${readA.body === markerA1}`,
      );

      const uploadB = await upload(cfg, sessionB, pathB, markerB, false);
      record("S3", "B uploads into B's own folder", classify(uploadB) === "ok", evidence(uploadB));

      const readB = await download(cfg, pathB, asOwner(sessionB));
      record(
        "S4",
        "B reads B's own file, byte for byte",
        classify(readB) === "ok" && readB.body === markerB,
        `${evidence(readB)} | bytes_match=${readB.body === markerB}`,
      );

      // ---- S5: A must not be able to read B's file. The control is that B reads the very same
      // path successfully with the same request shape, so a pass cannot come from a wrong URL
      // or a network problem. ----
      const aReadsB = await download(cfg, pathB, asOwner(sessionA));
      recordDenial(
        "S5",
        "A cannot read B's file (control: B can)",
        aReadsB,
        "policy",
        `content_leaked=${aReadsB.body.includes(markerB)} | control B read ${evidence(readB)}`,
      );

      // ---- S6: A must not be able to overwrite B's file, and B's bytes must be unchanged.
      // The control is that A can overwrite A's own file with the same request shape. ----
      const aOverwritesB = await upload(cfg, sessionA, pathB, markerInjected, true);
      recordDenial("S6a", "A cannot overwrite B's file (x-upsert)", aOverwritesB, "policy", "");
      const bAfterOverwrite = await download(cfg, pathB, asOwner(sessionB));
      record(
        "S6b",
        "B's file is unchanged after the overwrite attempt",
        classify(bAfterOverwrite) === "ok" && bAfterOverwrite.body === markerB,
        `${evidence(bAfterOverwrite)} | bytes_match=${bAfterOverwrite.body === markerB}`,
      );
      const aOverwritesOwn = await upload(cfg, sessionA, pathA, markerA2, true);
      record("S6c", "control: A can overwrite A's own file", classify(aOverwritesOwn) === "ok", evidence(aOverwritesOwn));

      // ---- S7 controls: prove the single-object delete works for the owner BEFORE reading a
      // cross-user delete as a policy denial. A scratch object of A's own is uploaded, deleted with
      // the same helper S7 uses, and its disappearance is confirmed. No service key is involved. ----
      const scratchSingle = objectPath(sessionA, runTag, "scratch-single.txt");
      const upScratchSingle = await upload(cfg, sessionA, scratchSingle, markerScratch, false);
      record(
        "S7ctl1",
        "control: A uploads a disposable scratch object of its own",
        classify(upScratchSingle) === "ok",
        evidence(upScratchSingle),
      );
      const delScratchSingle = await deleteObject(cfg, sessionA, scratchSingle);
      const delScratchSingleJson = parseJson(delScratchSingle);
      record(
        "S7ctl2",
        "control: A deletes its own scratch object (single-object delete)",
        classify(delScratchSingle) === "ok" && delScratchSingleJson.ok,
        `${evidence(delScratchSingle)} | body_is_json=${delScratchSingleJson.ok}`,
      );
      const scratchGone = await download(cfg, scratchSingle, asOwner(sessionA));
      recordDenial(
        "S7ctl3",
        "control: the deleted scratch object is gone for its owner",
        scratchGone,
        "policy",
        "same read helper as S2 - a 200 here would mean the delete never happened",
      );

      // ---- S7: A must not be able to delete B's file. A filtered delete answers 200 with an empty
      // list, so the proof is that B still reads the exact bytes afterwards, and - thanks to
      // S7ctl1-S7ctl3 - that this request shape is one the service actually honours. ----
      const aDeletesB = await deleteObject(cfg, sessionA, pathB);
      const aDeletesBJson = parseJson(aDeletesB);
      const bAfterDelete = await download(cfg, pathB, asOwner(sessionB));
      record(
        "S7",
        "A cannot delete B's file",
        !isHardFailure(aDeletesB) &&
          !aDeletesB.body.includes(pathB) &&
          (classify(aDeletesB) === "policy-denied" || (classify(aDeletesB) === "ok" && aDeletesBJson.ok)) &&
          classify(bAfterDelete) === "ok" &&
          bAfterDelete.body === markerB,
        `${evidence(aDeletesB)} | body_mentions_B_path=${aDeletesB.body.includes(pathB)} | B re-read ${evidence(bAfterDelete)}`,
      );

      // ---- S8: A must not be able to upload into B's folder. The control is S1/S6c: the same
      // upload call works in A's own folder. ----
      const injectedPathB = objectPath(sessionB, runTag, "injected-by-a.txt");
      const aUploadsIntoB = await upload(cfg, sessionA, injectedPathB, markerInjected, false);
      recordDenial(
        "S8a",
        "A cannot upload into B's folder",
        aUploadsIntoB,
        "policy",
        "control: S1 succeeded in A's own folder",
      );
      const bListsAfterInject = await listPrefix(cfg, prefixB, asOwner(sessionB));
      const bListAfterInject = listedNames(bListsAfterInject);
      const injectedVisible = bListAfterInject.names.some((name) => name.includes("injected-by-a"));
      record(
        "S8b",
        "B's folder holds only B's own file afterwards",
        classify(bListsAfterInject) === "ok" &&
          bListAfterInject.ok &&
          !injectedVisible &&
          bListAfterInject.names.length === 1,
        `B items=${bListAfterInject.names.length} (parse_ok=${bListAfterInject.ok}) | injected_visible=${injectedVisible}`,
      );

      // ---- S9: anonymous reads. The control is S2: the same URL with A's token returns the
      // bytes, so the failure is about identity, not about the path. ----
      const anonReadsA = await download(cfg, pathA, ANONYMOUS_ACCESS);
      recordDenial(
        "S9",
        "an anonymous request cannot read a private file",
        anonReadsA,
        "policy-or-auth",
        `content_leaked=${anonReadsA.body.includes(markerA2)} | control S2 ${evidence(readA)}`,
      );

      // ---- S10: anonymous uploads must fail and must leave nothing behind. ----
      const anonPath = objectPath(sessionA, runTag, "injected-anon.txt");
      const anonUpload = await uploadAnonymous(cfg, anonPath, markerAnon);
      recordDenial("S10a", "an anonymous request cannot upload", anonUpload, "policy-or-auth", "");
      const aListsAfterAnon = await listPrefix(cfg, prefixA, asOwner(sessionA));
      const aListAfterAnon = listedNames(aListsAfterAnon);
      const anonVisible = aListAfterAnon.names.some((name) => name.includes("injected-anon"));
      record(
        "S10b",
        "A's folder holds only A's file afterwards",
        classify(aListsAfterAnon) === "ok" &&
          aListAfterAnon.ok &&
          !anonVisible &&
          aListAfterAnon.names.length === 1,
        `A items=${aListAfterAnon.names.length} (parse_ok=${aListAfterAnon.ok}) | anon_object_visible=${anonVisible}`,
      );

      // ---- S11: an auth failure must look different from a policy denial, otherwise the
      // denials above could be nothing but a blanket error. The pass conditions are deliberately
      // narrow - the response must classify as an auth failure AND carry the auth signal AND carry
      // none of the three policy signals. The classifier tests auth first (fail-closed for the
      // policy assertions), so a body mixing authentication and policy wording would classify as an
      // auth failure; requiring the policy signals to be absent is what stops S11 from passing on a
      // policy denial that merely mentions an authentication keyword. The request path and the
      // deliberately invalid token are unchanged. S2 (before) and S12 (after) read this same URL
      // with A's genuine session and require 200, which is what makes the token - not the path - the
      // cause of the rejection. ----
      const bogusToken = await http(cfg, "GET", `/storage/v1/object/authenticated/${BUCKET}/${pathA}`, {
        as: "owner",
        token: "not.a.real.token",
      });
      const bogusSignals = signals(bogusToken);
      const bogusPolicySignal = bogusSignals.rls || bogusSignals.notFound || bogusSignals.accessDenied;
      record(
        "S11",
        "an invalid token fails as an AUTH error, not a policy denial",
        !isHardFailure(bogusToken) &&
          classify(bogusToken) === "auth-failure" &&
          bogusSignals.auth &&
          !bogusPolicySignal,
        `${evidence(bogusToken)} | auth_signal=${bogusSignals.auth} policy_signal=${bogusPolicySignal} | keeps S5-S10 from being blanket failures`,
      );

      // ---- S12: A's own file must have survived every denial attempt. ----
      const aFinal = await download(cfg, pathA, asOwner(sessionA));
      record(
        "S12",
        "A's own file survived every denial attempt",
        classify(aFinal) === "ok" && aFinal.body === markerA2,
        `${evidence(aFinal)} | bytes_match=${aFinal.body === markerA2}`,
      );

      // ---- S13 controls: prove the exact-name bulk delete works for the owner BEFORE reading a
      // cross-user bulk delete as a policy denial. Two scratch objects of A's own are uploaded under
      // a scratch prefix; the control then enumerates that prefix recursively, deletes those exact
      // names with the same helper S13 uses, and requires the re-listed prefix to be empty - so a
      // 200 response alone can never count as a successful deletion. No service key is involved. ----
      const scratchBulkOne = objectPath(sessionA, runTag, "scratch-bulk/one.txt");
      const scratchBulkTwo = objectPath(sessionA, runTag, "scratch-bulk/two.txt");
      const scratchPrefix = `${folderPrefix(sessionA, runTag)}scratch-bulk/`;
      const upScratchOne = await upload(cfg, sessionA, scratchBulkOne, markerScratch, false);
      const upScratchTwo = await upload(cfg, sessionA, scratchBulkTwo, markerScratch, false);
      record(
        "S13ctl1",
        "control: A uploads two disposable scratch objects of its own",
        classify(upScratchOne) === "ok" && classify(upScratchTwo) === "ok",
        `${evidence(upScratchOne)} / ${evidence(upScratchTwo)}`,
      );
      const delScratchBulk = await deleteEverythingUnderPrefix(cfg, scratchPrefix, asOwner(sessionA));
      record(
        "S13ctl2",
        "control: A deletes its own scratch prefix (exact names, re-listed empty)",
        delScratchBulk.ok,
        delScratchBulk.detail,
      );
      const scratchListAfter = await listPrefix(cfg, scratchPrefix, asOwner(sessionA));
      const scratchNamesAfter = listedNames(scratchListAfter);
      record(
        "S13ctl3",
        "control: A's own scratch prefix is empty after the bulk delete",
        classify(scratchListAfter) === "ok" && scratchNamesAfter.ok && scratchNamesAfter.names.length === 0,
        `${evidence(scratchListAfter)} | remaining=${scratchNamesAfter.names.length} (parse_ok=${scratchNamesAfter.ok})`,
      );

      // ---- S13: the bulk delete path (what a future "delete everything" uses) must not reach
      // across users either. It is exercised the way the API actually works - A hands the service
      // B's exact object name - and a filtered delete answers 200 with an empty list. ----
      const bulkForeign = await bulkDeleteNames(cfg, [pathB], asOwner(sessionA));
      const bulkDeleted = reportedDeleted(bulkForeign);
      const bAfterBulk = await download(cfg, pathB, asOwner(sessionB));
      record(
        "S13",
        "A's bulk delete of B's object (exact name) removes nothing",
        !isHardFailure(bulkForeign) &&
          !bulkForeign.body.includes(pathB) &&
          (classify(bulkForeign) === "policy-denied" ||
            (classify(bulkForeign) === "ok" && bulkDeleted.ok && bulkDeleted.paths.length === 0)) &&
          classify(bAfterBulk) === "ok" &&
          bAfterBulk.body === markerB,
        `${evidence(bulkForeign)} | reported_deleted=${bulkDeleted.paths.length} (parse_ok=${bulkDeleted.ok}) | B re-read ${evidence(bAfterBulk)}`,
      );


    }
  } catch (error) {
    console.log(`FAIL  the harness threw: ${error instanceof Error ? error.message : String(error)}`);
    record("X1", "the harness ran to completion without throwing", false, "see the message above");
  } finally {
    try {
      cleanupOk = await cleanup(cfg, sessions, runTag, unsafePrefixes);
    } catch (error) {
      console.log(`FAIL  cleanup threw: ${error instanceof Error ? error.message : String(error)}`);
      cleanupOk = false;
    }
  }

  // ---- summary, printed after cleanup so its outcome is known ----
  const failed = results.filter((result) => !result.ok);
  const passed = results.length - failed.length;
  const manifest = verifyManifest(results.map((result) => result.id));

  console.log("");
  console.log(
    `MANIFEST  required=${REQUIRED_ASSERTION_IDS.length} executed=${results.length} passed=${passed} failed=${failed.length} missing=${manifest.missing.length} duplicates=${manifest.duplicates.length} malformed=${manifest.malformed.length} unrecognized=${manifest.unrecognized.length} diagnostics=${manifest.diagnostics.length}`,
  );
  if (!manifest.ok) {
    console.log("manifest problems:");
    if (manifest.missing.length > 0) console.log(`  missing: ${manifest.missing.join(", ")}`);
    if (manifest.duplicates.length > 0) console.log(`  duplicates: ${manifest.duplicates.join(", ")}`);
    if (manifest.malformed.length > 0) console.log(`  malformed: ${manifest.malformed.join(", ")}`);
    if (manifest.unrecognized.length > 0) console.log(`  unrecognized: ${manifest.unrecognized.join(", ")}`);
    if (manifest.diagnostics.length > 0) {
      console.log(`  diagnostics present, so the run did not complete cleanly: ${manifest.diagnostics.join(", ")}`);
    }
  }

  if (blocked) {
    console.log("BLOCKED: no genuine local session was obtained, so no storage assertion ran.");
    console.log("This harness does not bypass authentication. Fix the blocker printed above and re-run.");
    console.log(
      `cleanup: ${cleanupOk ? "completed" : "INCOMPLETE"}${sessions.length === 0 ? " (no account was created)" : ""}`,
    );
    return 2;
  }

  console.log(
    `SUMMARY  passed=${passed} failed=${failed.length} cleanup=${cleanupOk ? "verified" : "INCOMPLETE"} manifest=${manifest.ok ? "complete" : "INCOMPLETE"}`,
  );
  if (failed.length > 0) {
    console.log("failed assertions:");
    for (const result of failed) console.log(`  ${result.id}  ${result.label} :: ${result.evidence}`);
  }

  if (failed.length === 0 && cleanupOk && manifest.ok) {
    console.log(
      "Storage security gate: PASSED - every required assertion ran and passed, and cleanup is verified.",
    );
    return 0;
  }
  console.log("Storage security gate: NOT PASSED.");
  if (failed.length === 0 && cleanupOk && !manifest.ok) {
    console.log(
      "Reason: the assertion manifest is not complete (see above), so this run cannot be reported as a pass.",
    );
  }
  return 1;
}


// ---------------------------------------------------------------------------
// Entry point. `--check` proves the harness loads and resolves a local-only target
// without sending a single request; that is how this file can be validated safely.
// ---------------------------------------------------------------------------

const CHECK_ONLY = process.argv.includes("--check");

if (CHECK_ONLY) {
  try {
    const cfg = resolveConfig();
    console.log("SomaMap storage test - dry run (--check): no request is sent, no account is created");
    console.log(`target: ${cfg.baseUrl} (loopback guard passed)`);
    console.log(`bucket: ${BUCKET}`);
    console.log("local demo keys: anon present, service present, issuer check passed (values never printed)");
    console.log(
      `planned assertions: ${REQUIRED_ASSERTION_IDS.length} required ids - preflight, matrix, S7/S13 delete controls and cleanup (see REQUIRED_ASSERTION_IDS)`,
    );
    console.log("storage routes: POST /storage/v1/object/{bucket}/{path}");
    console.log("                GET  /storage/v1/object/authenticated/{bucket}/{path}");
    console.log("                DELETE /storage/v1/object/{bucket} (exact object names, enumerated recursively)");
    console.log("                DELETE /storage/v1/object/{bucket}/{path}");
    console.log("                POST /storage/v1/object/list/{bucket}");
    console.log("admin routes, cleanup and leftover scan only: DELETE and GET /auth/v1/admin/users/{id}");
    console.log("dry run OK - the harness loads, resolves a local-only target, and is ready to run");
    process.exitCode = 0;
  } catch (error) {
    console.log(`BLOCKED  ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
} else {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.log(`FAIL  the harness crashed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}






