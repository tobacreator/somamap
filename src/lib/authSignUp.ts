import type { Session } from "./authSession.ts";
import type { SupabaseTarget } from "./supabaseTarget.ts";

/**
 * Account creation - the call itself, with no Next.js import in sight.
 *
 * It lives apart from `authSession.ts` for one practical reason: that module reads cookies through
 * `next/headers`, so it can only be loaded inside the server runtime. The call to the account service is
 * pure `fetch` and belongs where a test can reach it, which is how the sign-up path is covered at all.
 * The cookie the session becomes is set by the route, in the module that owns cookies.
 *
 * The publishable key travels; the service-role key does not exist in this path, is not read and is not
 * accepted here. Whether the answer carries a session depends on the project's email-confirmation
 * setting, and this function **reports which happened instead of assuming**: a session means the person
 * is signed in; no session means the project asks for the address to be confirmed first.
 *
 * Nothing is logged, and nothing but the session leaves: no password, no key, and no claim about why an
 * address was refused - the service does not say, and a guess would be a lie.
 */
export type SignUpResult =
  | { ok: true; session: Session | null; expiresInSeconds: number }
  | { ok: false; reason: "rejected" | "unavailable" };

export async function signUpWithPassword(
  config: SupabaseTarget,
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SignUpResult> {
  try {
    const response = await fetchImpl(`${config.baseUrl}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: config.anonKey, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.status !== 200 && response.status !== 201) return { ok: false, reason: "rejected" };

    const body = (await response.json()) as { access_token?: unknown; user?: { id?: unknown } };
    const accessToken = body.access_token;
    const userId = body.user?.id;

    if (typeof accessToken === "string" && accessToken.length > 0 && typeof userId === "string" && userId.length > 0) {
      return { ok: true, session: { userId, accessToken }, expiresInSeconds: 60 * 60 };
    }

    return { ok: true, session: null, expiresInSeconds: 0 };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
