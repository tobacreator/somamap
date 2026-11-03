import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE } from "@/lib/authSession";

/**
 * Sign-out - the way out of a session this build could previously only outlive.
 *
 * Until now nothing cleared the cookie sign-in sets, so a signed-in person on a shared device had no
 * way to end the session; it lapsed when the token did, about an hour later. This route is the missing
 * half of the session work, and it is deliberately the smallest possible one.
 *
 * What it does: deletes `somamap_session`, the one cookie this app sets, and answers `{ ok: true }`.
 * Nothing else is touched - no account, no row, no storage object, no token sent anywhere. There is no
 * server-side session to revoke and no provider to call: the session in this architecture *is* the
 * cookie, so clearing it is the whole of sign-out.
 *
 * A request without a session is not an error: the cookie is simply already absent, the delete is a
 * no-op, and the answer is the same. That keeps sign-out idempotent and safe to repeat.
 *
 * The response carries no key, no token and no identity - there is nothing to carry.
 */
export async function POST(): Promise<Response> {
  const store = await cookies();

  store.delete(SESSION_COOKIE);

  return NextResponse.json({ ok: true });
}
