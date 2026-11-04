import { NextResponse } from "next/server";

import { supabaseTarget } from "@/lib/authSession";
import { carriesRecoveryMarker, passwordProblem } from "@/lib/passwordReset";
import {
  exchangeRecoveryTokenHash,
  recoveryTokenIsValid,
  updatePasswordWithRecoveryToken,
} from "@/lib/passwordResetCall";

/**
 * The password-recovery route - the missing half of the session work.
 *
 * Why it exists: a recovery email links to the account service, which redirects to this site with the
 * session in the URL fragment. Nothing in the build read that fragment, so a person who followed a valid
 * recovery link landed on the home page with no way to choose a new password. This route is the server half
 * of the fix; `ResetPasswordForm` is the browser half, and it is the only thing that ever sees the fragment.
 *
 * The order is the security of the path, and it is deliberately strict:
 *
 *   1. **The target must resolve** (`supabaseTarget()`), exactly as sign-in and sign-up require - a
 *      half-configured deployment refuses here rather than changing a password in a project nobody chose.
 *   2. **The password must be plausible** before any request is made, so an empty or absurd body never
 *      reaches the account service.
 *   3. **The bearer must be verified** against the account service. A link that is expired, already used or
 *      forged is refused here, and nothing is changed.
 *   4. **A recovery marker, when the token carries one, must say recovery.** A token that states it came
 *      from somewhere else is refused; a token that states nothing is accepted, because a project that does
 *      not set the claim must not be able to lock a person out of their own recovery link. The marker is
 *      never trusted alone - step 3 already decided the token is real.
 *   5. **Only then** is the password changed, with the bearer as the authority.
 *
 * The user is never named by the caller: the account service takes the user from the token, so this route
 * cannot be pointed at somebody else's account, and no user id, address or token is accepted as a target.
 *
 * What it does not do: it sets no cookie and signs nobody in. The person is sent to sign in with the
 * password they just chose, which is the flow the screen describes. Nothing is logged - not the token, not
 * the password, not the address - and every answer is a category rather than a message from the service.
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

  const { token, tokenHash, password } = (body ?? {}) as {
    token?: unknown;
    tokenHash?: unknown;
    password?: unknown;
  };

  if (typeof password !== "string") return NextResponse.json({ error: "invalid request" }, { status: 400 });

  // The same rules the screen applies, applied again where they matter: a body that got past a browser is
  // not a reason to send an empty password to the account service.
  if (passwordProblem(password, password) !== null) {
    return NextResponse.json({ error: "weak-password" }, { status: 400 });
  }

  const carried =
    typeof token === "string" && token.length > 0
      ? ({ kind: "token", value: token } as const)
      : typeof tokenHash === "string" && tokenHash.length > 0
        ? ({ kind: "tokenHash", value: tokenHash } as const)
        : null;

  if (carried === null) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  let bearer: string;

  if (carried.kind === "token") {
    bearer = carried.value;
  } else {
    const exchanged = await exchangeRecoveryTokenHash(config, carried.value);

    if (!exchanged.ok) {
      return NextResponse.json(
        { error: exchanged.reason },
        { status: exchanged.reason === "unavailable" ? 503 : 400 },
      );
    }

    bearer = exchanged.token;
  }

  const verified = await recoveryTokenIsValid(config, bearer);

  if (verified === "unavailable") return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (verified === "invalid") return NextResponse.json({ error: "invalid-token" }, { status: 400 });

  if (carriesRecoveryMarker(bearer) === false) {
    return NextResponse.json({ error: "invalid-token" }, { status: 400 });
  }

  const updated = await updatePasswordWithRecoveryToken(config, bearer, password);

  if (!updated.ok) {
    return NextResponse.json({ error: updated.reason }, { status: updated.reason === "unavailable" ? 503 : 400 });
  }

  return NextResponse.json({ ok: true });
}
