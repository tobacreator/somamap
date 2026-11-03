import type { Metadata } from "next";
import Link from "next/link";

import Screen from "@/components/Screen";
import SignUpForm from "@/components/SignUpForm";
import { SIGNUP_INTRO, SIGNUP_SIGNIN_PROMPT, SIGNUP_TITLE } from "@/lib/copy";

/**
 * Create an account - the self-service half of the existing authentication.
 *
 * The screen is the sign-in screen's twin on purpose: same narrow measure, same heading, same field
 * component, and a link to the other screen so the two cannot become a dead end for each other. The form
 * itself is a client component because it holds what the person is typing; the account is created by the
 * server route, which is the only place the account service is called.
 *
 * No password-reset link appears here: password reset is not implemented in this build, and a link that
 * led nowhere would be worse than its absence.
 */
export const metadata: Metadata = {
  title: "SomaMap - create an account",
};

export default function SignUpPage() {
  return (
    <Screen width="form">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{SIGNUP_TITLE}</h1>
        <p className="text-body text-ink-muted">{SIGNUP_INTRO}</p>
      </header>

      <SignUpForm />

      <Link
        href="/sign-in"
        className="inline-flex min-h-11 items-center text-label font-medium text-accent-text underline"
      >
        {SIGNUP_SIGNIN_PROMPT}
      </Link>
    </Screen>
  );
}
