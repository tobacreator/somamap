/**
 * Recovery-link reading and password rules - the pure half of the password-reset path.
 *
 * Why this file exists: the recovery email links to Supabase's own `verify` endpoint, which answers with a
 * redirect to the configured site and puts the session in the URL **fragment**
 * (`#access_token=...&type=recovery`). A fragment never reaches a server, so reading it can only happen in
 * the browser. Everything decidable without a browser is decided here, where it can be tested without one:
 * which payload a URL carries, whether a token says it came from a recovery, and whether the two typed
 * passwords are usable.
 *
 * What this file deliberately does not do: it never verifies a token - only the account service can, and
 * `passwordResetCall.ts` asks it - never logs anything, and never keeps a token anywhere but in the value it
 * returns. Nothing here writes to storage, a cookie or the DOM.
 *
 * The maximum password length is a bound on what one request may carry, not a policy: the account service
 * decides what it accepts. It is set well above any password a person types, so the cap only ever stops a
 * pathological body.
 */

/** What a landing URL carried, or why it carried nothing usable. */
export type RecoveryPayload =
  | { kind: "token"; token: string }
  | { kind: "tokenHash"; tokenHash: string }
  | { kind: "expired" }
  | { kind: "none" };

/** The shortest password the account service accepts by default, and a bound on one request's body. */
export const RECOVERY_MIN_PASSWORD_LENGTH = 6;
export const RECOVERY_MAX_PASSWORD_LENGTH = 200;

/** Why the two typed passwords cannot be used. A closed set, so it can select one line of copy. */
export type PasswordProblem = "empty" | "short" | "long" | "mismatch";

/** A fragment or a query, without the character that introduces it. */
function paramsFrom(raw: string): URLSearchParams {
  const trimmed = raw.startsWith("#") || raw.startsWith("?") ? raw.slice(1) : raw;

  return new URLSearchParams(trimmed);
}

/**
 * The `amr` claim, when the token carries one: whether this session came from a recovery link.
 *
 * `null` means "this token carries no `amr` claim", which is **not** the same as "not a recovery": the
 * caller treats null as unknown rather than as a refusal, so a project that does not set the claim cannot
 * lock a person out of their own recovery link. The claim is read and never trusted on its own - the
 * account service verifies the signature when the token is used, so a forged claim travels with a token
 * that is refused anyway.
 */
export function carriesRecoveryMarker(token: string): boolean | null {
  const payload = token.split(".")[1];

  if (typeof payload !== "string" || payload.length === 0) return null;

  try {
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(decoded) as { amr?: unknown };

    if (!Array.isArray(parsed.amr)) return null;

    return parsed.amr.some((entry) => (entry as { method?: unknown })?.method === "recovery");
  } catch {
    return null;
  }
}

/**
 * The recovery payload a landing URL carries.
 *
 * Both shapes the provider can send are read: the fragment (`access_token` + `type=recovery`), which is what
 * the default email template produces, and a `token_hash` in the query, which a template using the hashed
 * form produces. An `error`/`error_code` in the fragment means the provider already refused the link, and it
 * is reported as expired rather than as "no link here", because those are different things to say.
 */
export function readRecoveryPayload(hash: string, search: string): RecoveryPayload {
  const fragment = paramsFrom(hash);
  const query = paramsFrom(search);

  if (fragment.has("error") || fragment.has("error_code")) return { kind: "expired" };

  const token = fragment.get("access_token");
  const type = fragment.get("type");

  if (typeof token === "string" && token.length > 0) {
    if (type === "recovery") return { kind: "token", token };
    if (type === null && carriesRecoveryMarker(token) === true) return { kind: "token", token };
  }

  const tokenHash = query.get("token_hash");
  const queryType = query.get("type");

  if (typeof tokenHash === "string" && tokenHash.length > 0 && (queryType === "recovery" || queryType === null)) {
    return { kind: "tokenHash", tokenHash };
  }

  return { kind: "none" };
}

/** Why the two typed passwords cannot be used, or null when they can. */
export function passwordProblem(password: string, confirmation: string): PasswordProblem | null {
  if (password.length === 0 || confirmation.length === 0) return "empty";
  if (password.length < RECOVERY_MIN_PASSWORD_LENGTH) return "short";
  if (password.length > RECOVERY_MAX_PASSWORD_LENGTH) return "long";
  if (password !== confirmation) return "mismatch";

  return null;
}
