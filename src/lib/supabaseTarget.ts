/**
 * Which Supabase project this server talks to - and proof that it is the one intended.
 *
 * Entry 24's audit found the gap this file closes: the previous rule was `SOMAMAP_LOCAL_*`
 * if set, otherwise `NEXT_PUBLIC_*`, with no validation at all. A local URL could be paired
 * with the hosted key, a "local" override could point anywhere, and a missing variable fell
 * silently through to whatever the other pair happened to be. This resolver refuses instead
 * of guessing.
 *
 * The rules, in order, and the reason each exists:
 *
 *   1. **The local pair is all or nothing.** `SOMAMAP_LOCAL_SUPABASE_URL` and
 *      `SOMAMAP_LOCAL_ANON_KEY` must both be set or neither. Half a pair is a mistake, and
 *      the dangerous half is the URL: a local URL with the hosted key silently sends the
 *      hosted credential to the local stack.
 *   2. **A local URL must be loopback.** Only 127.0.0.1, localhost, ::1 and [::1] count. A
 *      target called "local" that leaves the machine is not local.
 *   3. **A local key must be a local demo key.** The local stack's keys carry the issuer
 *      `supabase-demo`; a hosted key does not. This is what catches a local URL paired with
 *      the hosted key even when the operator set the variable by hand.
 *   4. **A hosted target must not carry a local key**, for the same reason in reverse.
 *   5. **The hosted pair is all or nothing**, and both halves are required before anything
 *      is used.
 *   6. **The mode is derived from the validated host**, not from a second variable that
 *      could disagree with it. There is deliberately no "mode" environment variable.
 *
 * The resolver is pure and takes the environment as an argument, so every one of those rules
 * is unit-tested with injected objects. It never reads a file, never makes a request, and
 * never returns or logs a key - only a target, or a failure category from a closed set.
 */

/** The four hosts that count as this machine. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** The issuer the local stack's own generated keys carry. */
const LOCAL_ISSUER = "supabase-demo";

export type SupabaseMode = "local" | "hosted";

/** A validated target: the mode, the base URL, and the key that belongs with it. */
export type SupabaseTarget = { mode: SupabaseMode; baseUrl: string; anonKey: string };

/** Why a configuration was refused. A closed set, so it is safe to show or log. */
export type TargetFailure =
  | "missing-configuration"
  | "incomplete-local-pair"
  | "incomplete-hosted-pair"
  | "invalid-url"
  | "local-url-not-loopback"
  | "local-key-not-local"
  | "hosted-key-is-local";

export type TargetResolution = { ok: true; target: SupabaseTarget } | { ok: false; reason: TargetFailure };

function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

/** An absolute http(s) URL with no path, or null. */
function parseBaseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);

    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.hostname.length === 0) return null;
    if (url.pathname !== "" && url.pathname !== "/") return null;

    return url;
  } catch {
    return null;
  }
}


/**
 * The key's `iss` claim, or null when it cannot be read. Metadata only: the signature and
 * the key itself are never used, stored or returned.
 */
export function keyIssuer(key: string): string | null {
  try {
    const payload = key.split(".")[1];

    if (typeof payload !== "string" || payload.length === 0) return null;

    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(decoded) as { iss?: unknown };

    return typeof parsed.iss === "string" ? parsed.iss : null;
  } catch {
    return null;
  }
}

/** Scheme and host only: a base URL never carries a path, a query or a fragment. */
function normalise(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

/** The validated target for this environment, or the reason none can be used. */
export function resolveSupabaseTarget(env: Record<string, string | undefined> = process.env): TargetResolution {
  const localUrlRaw = nonEmpty(env.SOMAMAP_LOCAL_SUPABASE_URL);
  const localKey = nonEmpty(env.SOMAMAP_LOCAL_ANON_KEY);
  const hostedUrlRaw = nonEmpty(env.NEXT_PUBLIC_SUPABASE_URL);
  const hostedKey = nonEmpty(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // Rules 1-3: the local pair, whenever either half is present.
  if (localUrlRaw !== null || localKey !== null) {
    if (localUrlRaw === null || localKey === null) return { ok: false, reason: "incomplete-local-pair" };

    const url = parseBaseUrl(localUrlRaw);

    if (!url) return { ok: false, reason: "invalid-url" };
    if (!LOOPBACK_HOSTS.has(url.hostname)) return { ok: false, reason: "local-url-not-loopback" };
    if (keyIssuer(localKey) !== LOCAL_ISSUER) return { ok: false, reason: "local-key-not-local" };

    return { ok: true, target: { mode: "local", baseUrl: normalise(url), anonKey: localKey } };
  }

  // Rules 4-6: otherwise the hosted pair, both halves required, with the mode derived.
  if (hostedUrlRaw === null && hostedKey === null) return { ok: false, reason: "missing-configuration" };
  if (hostedUrlRaw === null || hostedKey === null) return { ok: false, reason: "incomplete-hosted-pair" };

  const url = parseBaseUrl(hostedUrlRaw);

  if (!url) return { ok: false, reason: "invalid-url" };

  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  const issuer = keyIssuer(hostedKey);

  if (loopback && issuer !== LOCAL_ISSUER) return { ok: false, reason: "local-key-not-local" };
  if (!loopback && issuer === LOCAL_ISSUER) return { ok: false, reason: "hosted-key-is-local" };

  return { ok: true, target: { mode: loopback ? "local" : "hosted", baseUrl: normalise(url), anonKey: hostedKey } };
}

/** The host of a validated target, for display and logs. Never the key. */
export function targetHost(target: SupabaseTarget): string {
  try {
    return new URL(target.baseUrl).hostname;
  } catch {
    return "<unreadable>";
  }
}
