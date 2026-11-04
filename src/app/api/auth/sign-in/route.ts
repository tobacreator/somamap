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
 *
 * What changed, and why (`ISS-28` follow-up): a sign-in that fails because of **this deployment's own
 * configuration** used to leave no trace anywhere. A production deployment carrying a publishable key that
 * did not belong to the project in its URL therefore looked exactly like a person typing the wrong password -
 * the same screen, the same sentence, nothing in the logs - and it cost this project hours of investigation.
 * The route now writes one content-free line for the two categories that are the operator's to fix (a
 * refused configuration and a refused key, plus a busy or unreachable service). An ordinary rejected
 * credential still writes nothing, so a public endpoint cannot be used to flood a log, and the response is
 * byte-for-byte what it was: no caller learns anything new.
 */

/**
 * The server-side record for a sign-in the deployment itself could not complete.
 *
 * One line, content-free, in the shape the model boundary already uses: an event and a category from a
 * closed set. Never the address, the password, the token, the key or the service's own message.
 */
function recordRefusal(event: string, reason: string): void {
  console.warn(`SomaMap sign-in: ${JSON.stringify({ event, reason })}`);
}

export async function POST(request: Request): Promise<Response> {
  const resolution = supabaseTarget();

  if (!resolution.ok) {
    // The reason is a category from a closed set (`src/lib/supabaseTarget.ts`), so it is safe to keep and
    // it is the one thing that says which variable is wrong.
    recordRefusal("configuration-refused", resolution.reason);

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

  if (!result.ok) {
    // A rejected credential is deliberately not recorded: it is the common case, it says nothing an operator
    // needs, and recording it would let anyone fill the log. Everything else here is the deployment's own.
    if (result.reason !== "rejected") recordRefusal("provider-refusal", result.reason);

    return NextResponse.json({ error: "sign-in failed" }, { status: 401 });
  }

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
