import type { SupabaseTarget } from "./supabaseTarget.ts";

/**
 * The sign-in call itself, with no Next.js import in sight.
 *
 * It lives apart from `authSession.ts` for the same practical reason `authSignUp.ts` does: that module reads
 * cookies through `next/headers`, so it can only be loaded inside the server runtime, and a call that cannot
 * be loaded cannot be tested. This one is plain `fetch` with an injected implementation, which is how the
 * categories below are covered at all - and they are worth covering, because they are the only thing an
 * operator has to work from when a deployment's sign-in stops working.
 *
 * `authSession.ts` re-exports this function, so no caller changed when it moved.
 */

export type Session = { userId: string; accessToken: string };

/**
 * Why a sign-in could not be completed.
 *
 * The two that matter to whoever operates the deployment are `invalid-key` and `rate-limited`, and they are
 * named because they are **not** statements about the person: a refused publishable key is the deployment's
 * own misconfiguration, and a rate limit is the service being busy. Everything credential-shaped stays
 * `rejected`, one undifferentiated answer, so this union can never tell a caller whether an address exists -
 * which is the property the sign-in screen has always had.
 */
export type SignInRefusal = "invalid-key" | "rate-limited" | "rejected" | "unavailable";

export type SignInResult =
  | { ok: true; session: Session; expiresInSeconds: number }
  | { ok: false; reason: SignInRefusal };

/**
 * The account service's own error *code*, and nothing else.
 *
 * Only `error_code` is read: the accompanying `msg` is the service's sentence, this build does not display
 * it, and a category from a closed set is all a caller needs. A body that is not JSON - a proxy page, an
 * empty 401 - yields null rather than an exception, because a failed sign-in must not become a 500.
 */
async function providerErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error_code?: unknown };

    return typeof body.error_code === "string" ? body.error_code : null;
  } catch {
    return null;
  }
}

/**
 * Signs in with email and password against the account service. A refusal, a busy service and an
 * unreachable one are reported as different categories, and none of them echoes the credential back.
 *
 * A key the service refuses (`invalid_api_key`) is reported as `invalid-key` rather than as a rejected
 * credential. That distinction exists because the two need opposite fixes - one is a deployment's
 * configuration, the other is a person's typing - and collapsing them cost this project hours of
 * investigation when a production deployment was carrying a publishable key that did not belong to the
 * project in its URL. It reveals nothing about the caller.
 */
export async function signInWithPassword(
  config: SupabaseTarget,
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SignInResult> {
  try {
    const response = await fetchImpl(`${config.baseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: config.anonKey, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.status !== 200) {
      if (response.status === 429) return { ok: false, reason: "rate-limited" };
      if ((await providerErrorCode(response)) === "invalid_api_key") return { ok: false, reason: "invalid-key" };
      if (response.status >= 500) return { ok: false, reason: "unavailable" };

      return { ok: false, reason: "rejected" };
    }

    const body = (await response.json()) as { access_token?: unknown; user?: { id?: unknown } };
    const accessToken = body.access_token;
    const userId = body.user?.id;

    if (typeof accessToken !== "string" || accessToken.length === 0) return { ok: false, reason: "unavailable" };
    if (typeof userId !== "string" || userId.length === 0) return { ok: false, reason: "unavailable" };

    return { ok: true, session: { userId, accessToken }, expiresInSeconds: 60 * 60 };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
