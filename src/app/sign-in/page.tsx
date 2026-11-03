import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import PaperPage from "@/components/PaperPage";
import Screen from "@/components/Screen";
import SignInForm from "@/components/SignInForm";
import { SIGNIN_INTRO, SIGNIN_LOADING, SIGNIN_SIGNUP_PROMPT, SIGNIN_TITLE } from "@/lib/copy";
import { signInDestination } from "@/lib/signInDestination";

/**
 * Sign-in - the minimum authentication surface the delete-everything action needs.
 *
 * Scope is deliberately small: this screen exists so a real signed-in user can reach the settings
 * screen and press Delete everything. Account creation, password reset and session refresh are
 * later work.
 *
 * The `Screen` shell is used in its narrower form: a wide sign-in form is worse, not better
 * (Phase B, approved measure of about 420px).
 *
 * Its surface is the landing page's, shared with the sign-up screen: `PaperPage` for the warm paper, the
 * same serif heading step, and the header and form in one rounded band. The landing page's own "Sign in"
 * action lands here, so the two cannot look like different products.
 */
export const metadata: Metadata = {
  title: "SomaMap - sign in",
};

/**
 * The request-time part: it reads the destination, so it streams in behind the boundary.
 *
 * `next` is whatever the address bar carried, and it is not trusted: `signInDestination` matches it
 * against the app's own paths and falls back to the journal, so this prop is always a route this app
 * serves. The sign-in screen is the one place an attacker would look for an open redirect, which is why
 * the decision is an exact-match allow-list rather than a check on the shape of the string.
 */
async function SignInBody({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;

  return <SignInForm next={signInDestination(params.next)} />;
}

export default function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return (
    <PaperPage>
      <Screen width="form">
        <section className="flex flex-col gap-6 rounded-panel bg-surface/40 p-6 sm:p-8">
          <header className="flex flex-col gap-2">
            <h1 className="font-serif text-question font-semibold tracking-tight text-ink">{SIGNIN_TITLE}</h1>
            <p className="text-body text-ink-muted">{SIGNIN_INTRO}</p>
          </header>

          <Suspense fallback={<p className="text-label text-ink-muted">{SIGNIN_LOADING}</p>}>
            <SignInBody searchParams={searchParams} />
          </Suspense>
        </section>

        <Link
          href="/sign-up"
          className="inline-flex min-h-11 items-center text-label font-medium text-accent-text underline"
        >
          {SIGNIN_SIGNUP_PROMPT}
        </Link>
      </Screen>
    </PaperPage>
  );
}
