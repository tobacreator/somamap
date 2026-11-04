import type { Metadata } from "next";
import Link from "next/link";

import PaperPage from "@/components/PaperPage";
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
 * The surface is the landing page's, not a new one: `PaperPage` holds the warm paper in both colour modes,
 * the heading uses the same serif step the H1 uses, and the header and the form sit in one rounded band
 * with the same tint and padding as the hero. The link stays outside the band, as the landing page's links
 * do. The fields and the button are the shared components unchanged, so no control was redesigned to make
 * this screen match - only the page it stands on.
 *
 * No password-reset link appears here. Password recovery exists (`/reset-password`), but it is reached from
 * the link the account service emails, not from a screen in this app: this build has no "send me a link"
 * action, and a link to one would lead nowhere.
 */
export const metadata: Metadata = {
  title: "SomaMap - create an account",
};

export default function SignUpPage() {
  return (
    <PaperPage>
      <Screen width="form">
        <section className="flex flex-col gap-6 rounded-panel bg-surface/40 p-6 sm:p-8">
          <header className="flex flex-col gap-2">
            <h1 className="font-serif text-question font-semibold tracking-tight text-ink">{SIGNUP_TITLE}</h1>
            <p className="text-body text-ink-muted">{SIGNUP_INTRO}</p>
          </header>

          <SignUpForm />
        </section>

        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center text-label font-medium text-accent-text underline"
        >
          {SIGNUP_SIGNIN_PROMPT}
        </Link>
      </Screen>
    </PaperPage>
  );
}
