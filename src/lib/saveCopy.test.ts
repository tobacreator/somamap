import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { CHECKIN_BOX_KEPT, HOME_JOURNAL_NOTE, INTERVIEW_NOTE, REGION_MAP_NOTE } from "./copy.ts";

/**
 * The save-related copy - three strings that used to claim SomaMap saves nothing, and the journal line
 * that explains the one route which needs an account.
 *
 * The strings are asserted **verbatim** so the wording cannot drift, and asserted against the facts the
 * product actually has: a finished card is saved to the journal of a signed-in person, a signed-out
 * check-in is kept nowhere, and no line here promises that a check-in in progress survives anything.
 * The old claim ("does not save") is asserted absent, because that is the sentence this change removes.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("what the save-related copy now says", () => {
  it("states the corrected wording, word for word", () => {
    assert.equal(
      REGION_MAP_NOTE,
      "Region names come from a fixed body map: the same spot always names the same region. Nothing is generated, and this screen saves nothing.",
    );
    assert.equal(
      CHECKIN_BOX_KEPT,
      "Your words stay on this screen until you continue. A finished card is saved to your journal when you are signed in.",
    );
    assert.equal(
      INTERVIEW_NOTE,
      "Your answers stay on this screen until the card is finished. The finished card is saved to your journal when you are signed in.",
    );
  });

  it("no longer claims that nothing is saved anywhere", () => {
    for (const line of [REGION_MAP_NOTE, CHECKIN_BOX_KEPT, INTERVIEW_NOTE]) {
      assert.equal(line.includes("does not save"), false, line);
    }
  });

  it("ties the save to being signed in, and promises nothing about a signed-out check-in", () => {
    for (const line of [CHECKIN_BOX_KEPT, INTERVIEW_NOTE]) {
      assert.ok(line.includes("signed in"), line);
      assert.ok(line.includes("finished card"), line);
    }

    // No line may promise that work in progress is kept.
    for (const line of [REGION_MAP_NOTE, CHECKIN_BOX_KEPT, INTERVIEW_NOTE, HOME_JOURNAL_NOTE]) {
      assert.equal(/draft|autosave|saved as you go/i.test(line), false, line);
    }
  });
});

describe("the journal line on the home page", () => {
  it("says a journal needs an account and a sign-in", () => {
    assert.equal(HOME_JOURNAL_NOTE, "Your journal needs an account. Sign in, and the cards you finish are kept there.");
    assert.ok(HOME_JOURNAL_NOTE.includes("account"));
    assert.ok(HOME_JOURNAL_NOTE.includes("Sign in"));
  });

  it("is rendered next to the journal link", () => {
    const home = readFileSync(join(ROOT, "src/app/page.tsx"), "utf8");

    assert.ok(home.includes("HOME_JOURNAL_NOTE"), "the home page must render the journal line");
    assert.ok(home.includes('href="/journal"'), "the journal link stays");
  });
});
