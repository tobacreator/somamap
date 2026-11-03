import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE, supabaseTarget } from "@/lib/authSession";
import { signUpWithPassword } from "@/lib/authSignUp";

/**
 * Account creation - the self-service half of the existing authentication.
 *
 * The same shape as the sign-in route, and the same security posture: the target must be **validated**
 * (src/lib/supabaseTarget.ts), so a half-configured or mismatched environment refuses here rather than
 * creating an account in a project nobody chose; the call carries the **publishable key only** - the
 * service-role key is not read, not passed and not needed anywhere in this path; and the credentials go
 * to the account service over the server, never from the browser to a third party.
 *
 * Three outcomes, reported honestly and never guessed:
 *   - a session came back, so the person is signed in: the access token is set as the same httpOnly,
 *     same-site cookie sign-in uses, and the caller is told `confirmed: true`;
 *   - no session came back, because this project asks new accounts to confirm their email address first:
 *     the caller is told `confirmed: false` and the screen says so. Nothing is signed in, and no cookie
 *     is set;
 *   - the service refused, or could not be reached: the caller gets a category, and the screen shows the
 *     matching line. Nothing is created in the second case and nothing is claimed in the first.
 *
 * The response carries no key, no token, no email and no message from the account service.
 */
export async function POST(request: Request): Promise<Response> {
  const resolution = supabaseTarget();

  if (!resolution.ok) {
    return NextResponse.json({ error: "not configured", reason: resolution.reason }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.trim().length === 0 ||
    password.length === 0
  ) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const result = await signUpWithPassword(resolution.target, email.trim(), password);

  if (!result.ok) {
    const rejected = result.reason === "rejected";

    return NextResponse.json(
      { error: rejected ? "sign-up rejected" : "unavailable" },
      { status: rejected ? 400 : 503 },
    );
  }

  if (result.session === null) return NextResponse.json({ ok: true, confirmed: false });

  const store = await cookies();

  store.set(SESSION_COOKIE, result.session.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: result.expiresInSeconds,
  });

  return NextResponse.json({ ok: true, confirmed: true });
}
