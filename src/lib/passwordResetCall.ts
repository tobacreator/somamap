import type { SupabaseTarget } from "./supabaseTarget.ts";

/**
 * The password-recovery calls - the account service's own two steps, with no Next.js import in sight.
 *
 * It lives apart from `authSession.ts` for the same reason `authSignUp.ts` does: that module reads cookies
 * through `next/headers`, so it can only load inside the server runtime. These calls are plain `fetch` and
 * belong where a test can reach them, which is how the reset path is covered at all.
 *
 * The two steps are the ones the provider documents, and nothing else is invented:
 *
 *   1. **Verify.** `GET /auth/v1/user` with the bearer the recovery link carried. The account service checks
 *      the signature and the expiry, so a token that answers 200 is a real session for a real user. That is
 *      the only verification this path performs, and it happens before anything is changed.
 *   2. **Update.** `PUT /auth/v1/user` with `{ password }` and the same bearer. The user is implied by the
 *      token, never named by the caller: there is no user id in this module's input, so one person's link
 *      cannot be used to change another person's password.
 *
 * A template that sends a hashed link instead is handled by `exchangeRecoveryTokenHash`, which swaps the
 * `token_hash` for a session through `POST /auth/v1/verify` - the provider's own exchange, not a re-reading
 * of the token.
 *
 * The publishable key travels; the service-role key does not exist in this path, is not read and is not
 * accepted here. Nothing is logged, nothing but a category is returned, and no token, password or address
 * ever appears in a result.
 */

/** The outcome of changing a password with a recovery bearer. */
export type PasswordUpdateResult =
  | { ok: true }
  | { ok: false; reason: "invalid-token" | "weak-password" | "rejected" | "unavailable" };

/** The outcome of exchanging a hashed recovery link for a session. */
export type RecoverySessionResult =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid-token" | "unavailable" };

/**
 * Whether a recovery bearer is still good, or why that cannot be established.
 *
 * The account service is the only thing that can decide this, so this is a request rather than a reading of
 * the token's contents. A rate-limited or unreachable service is reported as `unavailable`, never as an
 * invalid link: telling someone their link is bad when the service was merely busy would be wrong.
 */
export async function recoveryTokenIsValid(
  config: SupabaseTarget,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<"valid" | "invalid" | "unavailable"> {
  try {
    const response = await fetchImpl(`${config.baseUrl}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: config.anonKey, authorization: `Bearer ${token}` },
    });

    if (response.status === 200) return "valid";

    return response.status === 429 || response.status >= 500 ? "unavailable" : "invalid";
  } catch {
    return "unavailable";
  }
}

/** The session behind a hashed recovery link, or a category. */
export async function exchangeRecoveryTokenHash(
  config: SupabaseTarget,
  tokenHash: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RecoverySessionResult> {
  try {
    const response = await fetchImpl(`${config.baseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: config.anonKey, "content-type": "application/json" },
      body: JSON.stringify({ type: "recovery", token_hash: tokenHash }),
    });

    if (response.status !== 200) {
      return { ok: false, reason: response.status === 429 || response.status >= 500 ? "unavailable" : "invalid-token" };
    }

    const body = (await response.json()) as { access_token?: unknown };
    const token = body.access_token;

    if (typeof token !== "string" || token.length === 0) return { ok: false, reason: "unavailable" };

    return { ok: true, token };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Change the password of the user the recovery bearer belongs to. */
export async function updatePasswordWithRecoveryToken(
  config: SupabaseTarget,
  token: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PasswordUpdateResult> {
  try {
    const response = await fetchImpl(`${config.baseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ password }),
    });

    if (response.status === 200) return { ok: true };
    if (response.status === 422) return { ok: false, reason: "weak-password" };
    if (response.status === 401 || response.status === 403) return { ok: false, reason: "invalid-token" };
    if (response.status === 429 || response.status >= 500) return { ok: false, reason: "unavailable" };

    return { ok: false, reason: "rejected" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
