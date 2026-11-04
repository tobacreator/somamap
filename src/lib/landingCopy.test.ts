import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  HOME_CLOSING,
  HOME_H1,
  HOME_SECTIONS,
  HOME_STEPS,
  HOME_STEPS_SENTENCE,
  HOME_SUBHEAD,
  HOME_SUBHEAD_2,
  HOME_SUPPORT_LINE,
  HOME_TITLE_TAG,
  SIGNIN_SIGNUP_PROMPT,
  SIGNUP_SIGNIN_PROMPT,
} from "./copy.ts";

/**
 * The public home page and the two auth screens - the copy and the wiring, held still.
 *
 * The landing copy is the owner's positioning for the Meta Global AI Developer Hackathon, and this test
 * is what makes "verbatim" a property rather than an intention: change a word and the check fails. It
 * replaced the market validation report's H1 and lead line on the owner's instruction; the three-step
 * explainer is still the report's approved wording, and is still asserted both as the report writes it and
 * as the page's three blocks, so splitting it for the layout can never quietly reword it.
 *
 * The four supporting points are pinned whole - titles and bodies - because a body is where a claim could
 * be added without anyone noticing: the third says what the product does not do, and the fourth says how
 * the interview is guided. Under this pin, rewording either one is a deliberate edit to two files, which
 * is the point of pinning them at all.
 *
 * The source checks cover what a copy test cannot: that `/` renders a page through the shell instead of
 * redirecting away, that the page renders the blocks this copy defines, and that sign-in and sign-up point
 * at each other so neither is a dead end.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function source(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

describe("the approved landing copy", () => {
  it("is the owner's positioning, word for word", () => {
    assert.equal(HOME_TITLE_TAG, "SomaMap - find the words for what you feel in your body");
    assert.equal(HOME_H1, "You know what you feel. Finding the words is another matter.");
    assert.equal(
      HOME_SUBHEAD,
      "SomaMap helps you put physical sensations into words - one question, one description, one moment at a time.",
    );
    assert.equal(HOME_SUBHEAD_2, "You do not need to know the right terms. Start with what you notice.");
    assert.equal(HOME_SUPPORT_LINE, "Your words. Your experience. No conclusions drawn.");
    assert.equal(
      HOME_CLOSING,
      "The goal is not to tell you what your body means. It is to help you describe what you feel.",
    );
  });

  it("splits the three-step explainer into its three sentences without rewording it", () => {
    assert.equal(HOME_STEPS.length, 3);
    assert.equal(HOME_STEPS.join(" "), HOME_STEPS_SENTENCE);
  });

  it("states the four supporting points in the approved words", () => {
    assert.deepEqual(HOME_SECTIONS, [
      {
        title: "Some feelings are hard to explain.",
        body: "A sensation can be familiar and still difficult to put into words. SomaMap gives you a place to describe what you notice, in your own language.",
      },
      {
        title: "Explore words. Keep the ones that fit.",
        body: "SomaMap offers words that might fit. Take one, leave it, say you are not sure, or write your own - nothing is added to your card unless you choose it.",
      },
      {
        title: "Your experience stays yours.",
        body: "SomaMap helps you describe sensations. It does not tell you what they mean, work out what caused them, or name a condition.",
      },
      {
        title: "A new way to explore the language of sensation.",
        body: "SomaMap explores how AI can help guide a person toward words for an experience that is hard to describe. The interview asks one question at a time, and the wording of every question is SomaMap's own.",
      },
    ]);
  });
});

describe("the public pages", () => {
  it("renders the home page through the shell instead of redirecting", () => {
    const home = source("src/app/page.tsx");

    assert.ok(home.includes("<Screen"), "the home page must render the Screen shell, which owns the fixed line");
    assert.ok(home.includes("HOME_H1"), "the home page must render the approved H1");
    assert.ok(home.includes("HOME_SECTIONS"), "the home page must render the four supporting points");
    assert.ok(home.includes("HOME_CLOSING"), "the home page must render the closing line");
    assert.equal(home.includes("redirect("), false, "the home page must render, not redirect");
  });

  it("renders the sign-up page through the shell", () => {
    const page = source("src/app/sign-up/page.tsx");

    assert.ok(page.includes("<Screen"));
    assert.ok(page.includes("SignUpForm"));
  });

  it("links sign-in and sign-up to each other", () => {
    assert.ok(source("src/app/sign-in/page.tsx").includes('href="/sign-up"'));
    assert.ok(source("src/app/sign-up/page.tsx").includes('href="/sign-in"'));
    assert.equal(SIGNIN_SIGNUP_PROMPT.length > 0, true);
    assert.equal(SIGNUP_SIGNIN_PROMPT.length > 0, true);
  });

  it("offers no link that does not exist, and no password-reset link", () => {
    const form = source("src/components/SignUpForm.tsx");
    const page = source("src/app/sign-up/page.tsx");
    const links = [...`${form}${page}`.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

    // The only destination either file links to is the sign-in screen: no reset link, no invented route.
    assert.deepEqual([...new Set(links)].sort(), ["/sign-in"]);

    // The destination after a created account is the check-in, and it is a navigation, not a link.
    assert.ok(form.includes('router.push("/checkin")'));
  });
});
