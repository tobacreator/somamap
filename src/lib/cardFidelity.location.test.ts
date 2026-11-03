import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  USER_LOCATION_MAX_LENGTH,
  groundModelDraft,
  mockCardFrom,
  preserveUserSelection,
  regionLabelFrom,
  userLocationFrom,
  withFallbackFidelity,
} from "./cardFidelity.ts";
import { interviewFixture } from "./fixtures.ts";
import { CARD_NOT_ANSWERED, LOCATION_PREFER_NOT_TO_SAY, LOCATION_PREFER_NOT_TO_SAY_NOTE } from "./copy.ts";
import { FALLBACK_CARD } from "./schema.ts";

/**
 * The location as the person's own words - Phase 2H.
 *
 * The fixed map used to decide what a location was allowed to be: anything outside its fourteen labels
 * became an empty string, so "left wrist" was silently dropped. These tests pin the replacement
 * behaviour - the text is kept as written, in every path that builds a card, and the model still has no
 * say in it at all.
 */

const SESSION = {
  answers: [{ questionId: "Q1", text: "a dull ache behind my eyes" }],
  regionLabel: "left wrist",
};

describe("normalising a location never rewrites it (Phase 2H)", () => {
  it("trims, collapses whitespace, and turns control characters into spaces", () => {
    assert.equal(userLocationFrom("  left wrist  "), "left wrist");
    assert.equal(userLocationFrom("left    wrist"), "left wrist");
    assert.equal(userLocationFrom("left\nwrist"), "left wrist");
    assert.equal(userLocationFrom("left\t\twrist"), "left wrist");
    assert.equal(userLocationFrom("left\u0000wrist"), "left wrist");
    assert.equal(userLocationFrom("left\u202Ewrist"), "left wrist");
    assert.equal(userLocationFrom("\n\n"), "");
    assert.equal(userLocationFrom("   "), "");
  });

  it("keeps capitalisation and the person's own terminology, and never substitutes a map label", () => {
    for (const typed of ["left wrist", "right ankle", "jaw", "ear", "lower abdomen", "Left Wrist", "my jaw, mostly"]) {
      assert.equal(userLocationFrom(typed), typed, typed);
    }

    // "arms" is the nearest label the map has; it is never what the person said.
    assert.equal(userLocationFrom("left wrist"), "left wrist");
    assert.notEqual(userLocationFrom("left wrist"), "arms");
    assert.equal(userLocationFrom("elbow"), "elbow");
  });

  it("caps the location at 60 characters, and refuses anything that is not a string", () => {
    assert.equal(USER_LOCATION_MAX_LENGTH, 60);
    assert.equal(userLocationFrom("x".repeat(80)).length, 60);
    assert.equal(userLocationFrom("y".repeat(60)), "y".repeat(60));
    assert.equal(userLocationFrom(`${"z".repeat(59)} tail`).length <= 60, true);

    for (const wrong of [undefined, null, 7, true, [], {}, () => "left wrist"]) {
      assert.equal(userLocationFrom(wrong), "", String(wrong));
    }
  });
});

describe("a typed location reaches every card the same way (Phase 2H)", () => {
  it("grounds a valid draft, the reviewed fallback and mock mode to the person's own words", () => {
    const draft = { ...interviewFixture.draft_card, location_label: "the model's guess" };

    assert.equal(groundModelDraft(draft, SESSION).location_label, "left wrist");
    assert.equal(withFallbackFidelity(FALLBACK_CARD, SESSION).location_label, "left wrist");
    assert.equal(mockCardFrom(SESSION).location_label, "left wrist");
    assert.equal(preserveUserSelection(draft, SESSION).location_label, "left wrist");
  });

  it("still discards whatever the model says the location is", () => {
    const grounded = groundModelDraft(
      { ...interviewFixture.draft_card, location_label: "right knee, probably" },
      { answers: SESSION.answers, regionLabel: "jaw" },
    );

    assert.equal(grounded.location_label, "jaw");
    assert.equal(JSON.stringify(grounded).includes("probably"), false);
  });

  it("leaves the map's own vocabulary exactly as it was", () => {
    // `regionLabelFrom` still answers "is this a label the map knows?", which is what the tap targets
    // need; the session no longer uses it to decide what a person is allowed to say.
    assert.equal(regionLabelFrom("left wrist"), "");
    assert.equal(regionLabelFrom("chest"), "chest");
  });
});

describe("choosing not to name a location is an answer, not a gap (Phase 2H)", () => {
  it("has its own wording, distinct from the unanswered row", () => {
    assert.equal(LOCATION_PREFER_NOT_TO_SAY, "Prefer not to say");
    assert.notEqual(LOCATION_PREFER_NOT_TO_SAY, CARD_NOT_ANSWERED);
    assert.ok(LOCATION_PREFER_NOT_TO_SAY_NOTE.length > 0);
  });

  it("sends no location at all, so the card carries none", () => {
    // What the check-in screen sends when the choice is made: an empty label, exactly as if the map had
    // never been tapped - which is what the card renders as unanswered rather than as a name.
    for (const source of [{ answers: [], regionLabel: "" }, { answers: [] }]) {
      assert.equal(mockCardFrom(source).location_label, "");
      assert.equal(groundModelDraft(interviewFixture.draft_card, source).location_label, "");
      assert.equal(withFallbackFidelity(FALLBACK_CARD, source).location_label, FALLBACK_CARD.location_label);
    }
  });
});
