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

export type SignInResult =
  | { ok: true; session: Session; expiresInSeconds: number }
  | { ok: false; reason: "rejected" | "unavailable" };

/**
 * Signs in with email and password against the local Auth API. A rejection and an
 * unreachable service are reported as different categories, and neither echoes the
 * credential back.
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

    if (response.status !== 200) return { ok: false, reason: "rejected" };

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
