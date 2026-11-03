import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/Button";
import Screen from "@/components/Screen";
import {
  HOME_ACCOUNT_NOTE,
  HOME_H1,
  HOME_JOURNAL_ACTION,
  HOME_JOURNAL_NOTE,
  HOME_PRIMARY_ACTION,
  HOME_SECONDARY_ACTION,
  HOME_SIGNUP_ACTION,
  HOME_STEPS,
  HOME_STEPS_TITLE,
  HOME_SUBHEAD,
  HOME_TITLE_TAG,
} from "@/lib/copy";

/**
 * The public home page - the market validation report's approved landing copy, in the approved visual
 * direction.
 *
 * What it is: one column on the `Screen` shell (so the measure, the gutter and the fixed line are the
 * shell's, not this page's), the approved H1 in the humanist serif, the approved subhead beneath it, two
 * actions - start a check-in, or sign in - and the three-step explainer as three blocks separated by
 * hairlines rather than three cards.
 *
 * What it deliberately is not: there is no FAQ (the report's four answers are not in this workspace and
 * inventing them would be inventing approved copy), no stock imagery, no claim about what a sensation
 * means or what causes it, and no statement about what any external provider does with a person's words -
 * that belongs to the disclosure, on the screen where it applies.
 *
 * The account line is there for one reason: a first-time visitor must learn that an account exists
 * *before* reaching a flow whose saving needs one. The check-in itself needs no account, and the line says
 * so.
 *
 * `/` used to redirect to `/checkin`. It renders a page now, so the product has one place that says what
 * it is - and the fixed line arrives from the shell like every other screen's.
 */
export const metadata: Metadata = {
  title: HOME_TITLE_TAG,
};

const LINK_CLASS = "inline-flex min-h-11 items-center text-label font-medium text-accent-text underline";

export default function HomePage() {
  return (
    <Screen>
      <header className="flex flex-col gap-4">
        <h1 className="font-serif text-question font-semibold tracking-tight text-ink md:text-display">
          {HOME_H1}
        </h1>

        <p className="text-lead leading-7 text-ink-muted">{HOME_SUBHEAD}</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link href="/checkin" className={buttonClass("primary")}>
          {HOME_PRIMARY_ACTION}
        </Link>

        <Link href="/sign-in" className={buttonClass("secondary")}>
          {HOME_SECONDARY_ACTION}
        </Link>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-body leading-6 text-ink-muted">{HOME_ACCOUNT_NOTE}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/sign-up" className={LINK_CLASS}>
            {HOME_SIGNUP_ACTION}
          </Link>

          <Link href="/journal" className={LINK_CLASS}>
            {HOME_JOURNAL_ACTION}
          </Link>
        </div>

        {/* The journal needs a session; saying so here is cheaper than letting the redirect explain it. */}
        <p className="text-body leading-6 text-ink-muted">{HOME_JOURNAL_NOTE}</p>
      </div>

      <section aria-labelledby="home-steps" className="flex flex-col gap-2">
        <h2 id="home-steps" className="text-label font-medium text-ink-muted">
          {HOME_STEPS_TITLE}
        </h2>

        <ol className="flex flex-col divide-y divide-rule border-t border-rule">
          {HOME_STEPS.map((step, index) => (
            <li key={step} className="flex items-baseline gap-3 py-3">
              <span aria-hidden="true" className="text-label font-medium text-accent-text">
                {index + 1}
              </span>

              <p className="text-body leading-6 text-ink">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </Screen>
  );
}

