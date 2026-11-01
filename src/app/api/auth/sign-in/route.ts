import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE, signInWithPassword, supabaseTarget } from "@/lib/authSession";

/**
 * Sign-in - the minimum session the delete-everything action needs.
 *
 * The target comes from the validated resolver, so a mismatched or half-configured
 * environment is refused here too: sign-in never falls back to a project nobody chose.
 *
 * The access token is stored in an httpOnly, same-site cookie, so no script can read it.
 * A failed sign-in answers one flat message: whether the address exists is not something
 * this route tells an unauthenticated caller.
 */
export async function POST(request: Request): Promise<Response> {
  const resolution = supabaseTarget();

  if (!resolution.ok) {
    return NextResponse.json({ error: "not configured", reason: resolution.reason }, { status: 500 });
  }

  const config = resolution.target;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };

  if (typeof email !== "string" || typeof password !== "string" || email.length === 0 || password.length === 0) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const result = await signInWithPassword(config, email, password);

  if (!result.ok) return NextResponse.json({ error: "sign-in failed" }, { status: 401 });

  const store = await cookies();

  store.set(SESSION_COOKIE, result.session.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: result.expiresInSeconds,
  });

  return NextResponse.json({ ok: true });
}
