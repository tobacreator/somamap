import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  HOME_H1,
  HOME_STEPS,
  HOME_STEPS_SENTENCE,
  HOME_SUBHEAD,
  HOME_TITLE_TAG,
  SIGNIN_SIGNUP_PROMPT,
  SIGNUP_SIGNIN_PROMPT,
} from "./copy.ts";

/**
 * The public home page and the two auth screens - the copy and the wiring, held still.
 *
 * The landing copy is the market validation report's approved wording, and this test is what makes
 * "verbatim" a property rather than an intention: change a word and the check fails. The three-step
 * explainer is asserted both as the report writes it and as the page's three blocks, so splitting it for
 * the layout can never quietly reword it.
 *
 * The source checks cover what a copy test cannot: that `/` renders a page through the shell instead of
 * redirecting away, and that sign-in and sign-up point at each other so neither is a dead end.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function source(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

describe("the approved landing copy", () => {
  it("is the report's wording, word for word", () => {
    assert.equal(HOME_TITLE_TAG, "SomaMap - find the words for what you feel in your body");
    assert.equal(HOME_H1, "Point at your body. Find the words.");
    assert.equal(
      HOME_SUBHEAD,
      "Notice, name, and remember sensations - then bring the words to your appointment.",
    );
    assert.equal(HOME_STEPS_SENTENCE, "Tap it. Describe it with a little help. Bring the words.");
  });

  it("splits the three-step explainer into its three sentences without rewording it", () => {
    assert.equal(HOME_STEPS.length, 3);
    assert.equal(HOME_STEPS.join(" "), HOME_STEPS_SENTENCE);
  });
});

describe("the public pages", () => {
  it("renders the home page through the shell instead of redirecting", () => {
    const home = source("src/app/page.tsx");

    assert.ok(home.includes("<Screen"), "the home page must render the Screen shell, which owns the fixed line");
    assert.ok(home.includes("HOME_H1"), "the home page must render the approved H1");
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
