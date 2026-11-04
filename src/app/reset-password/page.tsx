import type { Metadata } from "next";
import Link from "next/link";

import PaperPage from "@/components/PaperPage";
import ResetPasswordForm from "@/components/ResetPasswordForm";
import Screen from "@/components/Screen";
import { RESET_INTRO, RESET_SIGNIN_LINK, RESET_TITLE } from "@/lib/copy";

/**
 * The password-recovery screen - the destination a recovery link is sent to.
 *
 * It is the sign-in and sign-up screens' third sibling on purpose: same narrow measure, same serif heading,
 * same field components, and the same surface (`PaperPage`), so a person who followed a link from their own
 * email arrives somewhere that is visibly the same product.
 *
 * The screen itself is a server component and holds no token: the fragment never reaches the server, and the
 * form is the client half that reads it. That split is the whole design - the part that can see a secret is
 * the smallest part, and it is the part that immediately puts the secret out of sight.
 */
export const metadata: Metadata = {
  title: "SomaMap - new password",
};

export default function ResetPasswordPage() {
  return (
    <PaperPage>
      <Screen width="form">
        <section className="flex flex-col gap-6 rounded-panel bg-surface/40 p-6 sm:p-8">
          <header className="flex flex-col gap-2">
            <h1 className="font-serif text-question font-semibold tracking-tight text-ink">{RESET_TITLE}</h1>
            <p className="text-body text-ink-muted">{RESET_INTRO}</p>
          </header>

          <ResetPasswordForm />
        </section>

        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center text-label font-medium text-accent-text underline"
        >
          {RESET_SIGNIN_LINK}
        </Link>
      </Screen>
    </PaperPage>
  );
}
