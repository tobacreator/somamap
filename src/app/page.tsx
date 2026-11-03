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

/**
 * The page's one image: a quiet, abstract figure drawn in the product's own tokens.
 *
 * It is the product's own idea, reduced to its gentlest form - a body, and a place on it - so the top of
 * the page shows what SomaMap is about without a photograph, an illustration of a person, or anything
 * that could read as clinical. Soft sand fills, hairline outlines, one clay point where a person would
 * point. It is decorative: the H1 carries the meaning, so the figure is hidden from assistive technology
 * rather than described, and it scales with the column instead of being a fixed asset.
 */
function FigureMark() {
  return (
    <svg
      viewBox="0 0 140 200"
      aria-hidden="true"
      focusable="false"
      className="h-auto w-full max-w-[8.5rem] sm:max-w-[10rem] md:max-w-[11rem]"
    >
      {/* the soft wash the figure sits on */}
      <ellipse cx="70" cy="176" rx="52" ry="9" className="fill-tint" />

      {/* head and neck */}
      <circle cx="70" cy="30" r="19" className="fill-surface stroke-hairline" strokeWidth="1.6" />
      <rect x="64" y="47" width="12" height="10" rx="5" className="fill-surface" />

      {/* torso: one rounded shape, no anatomy */}
      <path
        d="M70 56c19 0 33 10 35 27l5 41c1 12-3 19-12 21l-8 2c-1 7-3 13-6 19h-28c-3-6-5-12-6-19l-8-2c-9-2-13-9-12-21l5-41c2-17 16-27 35-27Z"
        className="fill-surface stroke-hairline"
        strokeWidth="1.6"
      />

      {/* arms, resting */}
      <rect x="20" y="72" width="13" height="66" rx="6.5" className="fill-surface stroke-hairline" strokeWidth="1.4" />
      <rect x="107" y="72" width="13" height="66" rx="6.5" className="fill-surface stroke-hairline" strokeWidth="1.4" />

      {/* the one clay point: where a person would point */}
      <circle cx="52" cy="86" r="7.5" className="fill-accent stroke-paper" strokeWidth="2.4" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="landing flex min-h-screen flex-col bg-paper">
      <Screen>
        <section className="flex flex-col gap-8 rounded-panel bg-surface/40 p-6 sm:p-8 md:flex-row md:items-center md:gap-12 md:p-10">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
          <h1 className="font-serif text-question font-semibold tracking-tight text-ink md:text-hero">
            {HOME_H1}
          </h1>

          <p className="text-lead leading-7 text-ink-muted">{HOME_SUBHEAD}</p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link href="/checkin" className={buttonClass("primary", "lg")}>
              {HOME_PRIMARY_ACTION}
            </Link>

            <Link href="/sign-in" className={buttonClass("secondary")}>
              {HOME_SECONDARY_ACTION}
            </Link>
          </div>
        </div>

        <div className="flex justify-center md:flex-none">
          <FigureMark />
        </div>
      </section>

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

      <section aria-labelledby="home-steps" className="flex flex-col gap-4">
        <h2 id="home-steps" className="text-label font-medium text-ink-muted">
          {HOME_STEPS_TITLE}
        </h2>

        {/* Three blocks divided by hairlines rather than three cards: the approved direction, and the
            reason the grid uses a one-pixel gap over the rule colour instead of borders. */}
        <ol className="grid gap-px overflow-hidden rounded-panel bg-rule sm:grid-cols-3">
          {HOME_STEPS.map((step, index) => (
            <li key={step} className="flex flex-col gap-3 bg-paper p-5">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-pill bg-accent/10 text-label font-semibold text-accent-text"
              >
                {index + 1}
              </span>

              <p className="text-body leading-6 text-ink">{step}</p>
            </li>
          ))}
        </ol>
      </section>
      </Screen>
    </div>
  );
}

