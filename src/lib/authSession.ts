import { cookies } from "next/headers";

import { resolveSupabaseTarget, type SupabaseTarget, type TargetResolution } from "./supabaseTarget.ts";

/**
 * The minimum authentication foundation T8 needs - and no more.
 *
 * The app had no session at all, so a delete-everything action had no user to act as. This
 * file adds exactly what that requires: a sign-in call, and a session read that **verifies
 * the token against the Auth API on every use**. The user id always comes from that verified
 * answer - never from the cookie's contents, never from a request body.
 *
 * Which project it talks to is not decided here any more: `supabaseTarget()` delegates to
 * `src/lib/supabaseTarget.ts`, which validates the environment and refuses to guess. There
 * is no second, unvalidated fallback in this file or in any route that uses it.
 *
 * Scope limits, stated on purpose: the access token is held in an httpOnly cookie and there
 * is no refresh flow yet, so a session lasts as long as the token does. Account management,
 * sign-up and password reset are later work. Nothing here logs a key, a token or an email.
 */

export const SESSION_COOKIE = "somamap_session";

/** The validated target for this process, or the reason there is none. */
export function supabaseTarget(): TargetResolution {
  return resolveSupabaseTarget();
}

/** The validated target, or null - the shape every route has always used. */
export function localConfig(): SupabaseTarget | null {
  const resolution = supabaseTarget();

  return resolution.ok ? resolution.target : null;
}

export type Session = { userId: string; accessToken: string };

/**
 * The sign-in call and its categories live in `authSignIn.ts`, which imports nothing from Next.js.
 *
 * They are re-exported here so that every caller keeps importing them from the module it always did, and so
 * that the one thing this file is for - the cookie the session becomes - stays in one place. The call itself
 * had to move to be testable at all: this module reads cookies through `next/headers`, which a plain test
 * cannot load.
 */
export { signInWithPassword } from "./authSignIn.ts";
export type { SignInRefusal, SignInResult } from "./authSignIn.ts";


/**
 * The signed-in session, verified. The cookie's token is checked against the Auth API and
 * the user id is taken from that answer, so a forged or stale cookie yields null rather than
 * an identity. Returns null when there is no cookie, no configuration, or no valid session.
 */
export async function currentSession(fetchImpl: typeof fetch = fetch): Promise<Session | null> {
  const config = localConfig();

  if (!config) return null;

  const store = await cookies();
  const accessToken = store.get(SESSION_COOKIE)?.value;

  if (typeof accessToken !== "string" || accessToken.length === 0) return null;

  try {
    const response = await fetchImpl(`${config.baseUrl}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: config.anonKey, authorization: `Bearer ${accessToken}` },
    });

    if (response.status !== 200) return null;

    const body = (await response.json()) as { id?: unknown };

    if (typeof body.id !== "string" || body.id.length === 0) return null;

    return { userId: body.id, accessToken };
  } catch {
    return null;
  }
}

/** True when the account behind a session still exists, checked against the Auth API. */
export async function accountStillExists(
  config: SupabaseTarget,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(`${config.baseUrl}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: config.anonKey, authorization: `Bearer ${accessToken}` },
    });

    return response.status === 200;
  } catch {
    return false;
  }
}
