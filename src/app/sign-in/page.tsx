import type { Metadata } from "next";

import Screen from "@/components/Screen";
import SignInForm from "@/components/SignInForm";
import { SIGNIN_INTRO, SIGNIN_TITLE } from "@/lib/copy";

/**
 * Sign-in - the minimum authentication surface the delete-everything action needs.
 *
 * Scope is deliberately small: this screen exists so a real signed-in user can reach the settings
 * screen and press Delete everything. Account creation, password reset and session refresh are
 * later work.
 *
 * The `Screen` shell is used in its narrower form: a wide sign-in form is worse, not better
 * (Phase B, approved measure of about 420px).
 */
export const metadata: Metadata = {
  title: "SomaMap - sign in",
};

export default function SignInPage() {
  return (
    <Screen width="form">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{SIGNIN_TITLE}</h1>
        <p className="text-body text-ink-muted">{SIGNIN_INTRO}</p>
      </header>

      <SignInForm />
    </Screen>
  );
}
