import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JOURNAL_CARD_SAVED, JOURNAL_CARD_SIGNED_OUT, JOURNAL_CARD_SIGN_IN_LINK } from "./copy.ts";
import { saveIntentFor } from "./journalSave.ts";

/**
 * Whether a finished card may be written (`ISS-17`).
 *
 * The policy is one function, so it is checked here rather than through a browser: with a session the
 * card is written; without one no request is made and the screen says why. The wording is checked too,
 * because the point of the change is that the screen tells the truth - it must say the card is not
 * saved, and it must never say it was.
 */
describe("whether a finished card may be written", () => {
  it("writes the card when there is a session", () => {
    assert.deepEqual(saveIntentFor(true), { attempt: true });
  });

  it("makes no request when there is none, and carries the reason", () => {
    const intent = saveIntentFor(false);

    assert.equal(intent.attempt, false);
    assert.equal(intent.attempt === false ? intent.notice : null, JOURNAL_CARD_SIGNED_OUT);
  });

  it("says the card is not saved, and never says it was", () => {
    assert.ok(JOURNAL_CARD_SIGNED_OUT.includes("not saved"), JOURNAL_CARD_SIGNED_OUT);
    assert.ok(JOURNAL_CARD_SIGNED_OUT.includes("signed in"), JOURNAL_CARD_SIGNED_OUT);
    assert.notEqual(JOURNAL_CARD_SIGNED_OUT, JOURNAL_CARD_SAVED);
    assert.equal(JOURNAL_CARD_SIGNED_OUT.includes(JOURNAL_CARD_SAVED), false);
  });

  it("says the card is still on screen, so nothing reads as lost", () => {
    assert.ok(JOURNAL_CARD_SIGNED_OUT.includes("still on this screen"));
  });

  it("offers one way to keep cards, and it is the sign-in screen", () => {
    assert.ok(JOURNAL_CARD_SIGN_IN_LINK.includes("Sign in"));
  });
});
