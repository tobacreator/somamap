import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mockCardFrom, preserveUserSelection, regionLabelFrom, withFallbackFidelity } from "./cardFidelity.ts";
import { cardViewForPayload } from "./cardView.ts";
import { CARD_NOT_ANSWERED } from "./copy.ts";
import { interviewFixture } from "./fixtures.ts";
import { interviewStep, questionForStep, type InterviewDeps } from "./interview.ts";
import { mockAdapter } from "./models.ts";
import { REGION_LABELS } from "./regions.ts";
import { FALLBACK_CARD, sensationCardSchema } from "./schema.ts";

/**
 * Card fidelity's tests - the regression pack for the accuracy fix (BUILD-REPORT.md Entry 42).
 *
 * The defect these tests exist for: mock mode returned a recorded draft card verbatim, so a session
 * could show a sentence the user never typed, in a region they never tapped, and `usedFallback:
 * false` presented it as their own. Six properties now pin the behaviour:
 *
 *   1. the mock's card is not a constant - two sessions produce two different cards;
 *   2. every field is the session's own material (through the real `interviewStep`);
 *   3. nothing on the card is a word the user did not type;
 *   4. all fourteen regions reach the card, end to end through the state machine;
 *   5. no recorded fixture value can appear on a card from another session;
 *   6. an empty session produces an empty card, never a filled-in one.
 *
 * Everything here is mock mode: no provider, no network, no environment, no clock.
 */

const DEPS: InterviewDeps = { adapter: mockAdapter, logger: () => {}, mode: "mock" };

/** The question ids the mock adapter's sequence names, one answer per question. */
function answersFor(texts: readonly string[]) {
  return texts.map((text, index) => ({ questionId: questionForStep(index, mockAdapter).id, text }));
}

/** A finished session, driven through the real state machine. */
function completeSession(texts: readonly string[], regionLabel?: string) {
  const result = interviewStep({ answers: answersFor(texts), regionLabel }, DEPS);

  assert.equal(result.status, "complete", `the session did not complete: ${JSON.stringify(result)}`);

  if (result.status !== "complete") throw new Error("the session did not complete");

  return result;
}

describe("the mock's card is derived, never replayed", () => {
  it("builds two different cards from two different sessions", () => {
    const first = mockCardFrom({ answers: answersFor(["a dull ache behind my eyes"]), regionLabel: "head" });
    const second = mockCardFrom({ answers: answersFor(["a cold knot low in my belly"]), regionLabel: "abdomen" });

    assert.notDeepEqual(first, second);
    assert.equal(first.location_label, "head");
    assert.equal(second.location_label, "abdomen");
  });

  it("is never the recorded fixture, for any session", () => {
    const sessions = [
      { answers: answersFor(["a dull ache behind my eyes"]), regionLabel: "head" },
      { answers: answersFor(["tight and heavy", "like a scarf knotted too tight", "since this morning"]), regionLabel: "shoulder" },
      { answers: [] },
      { answers: answersFor([""]) },
    ];

    for (const session of sessions) {
      const card = mockCardFrom(session);

      assert.notDeepEqual(card, interviewFixture.draft_card, JSON.stringify(session));
      assert.equal(sensationCardSchema.safeParse(card).success, true, JSON.stringify(card));
    }
  });

  it("is pure: the same session twice is the same card", () => {
    const session = { answers: answersFor(["a heavy fog", "like a wet blanket", "for an hour"]), regionLabel: "chest" };

    assert.deepEqual(mockCardFrom(session), mockCardFrom(session));
  });
});


describe("the card is the session's own material", () => {
  it("carries the region the user selected and the words they typed, end to end", () => {
    const session = completeSession(["a dull ache behind my eyes", "like a foggy window", "for two days"], "head");

    assert.deepEqual(session.card, {
      location_label: "head",
      quality_words: ["dull", "ache", "behind", "eyes", "foggy"],
      intensity_metaphor: "like a foggy window",
      duration: "for two days",
      user_own_sentence: "a dull ache behind my eyes",
    });
    assert.equal(session.usedFallback, false);

    // ...and that is what the screen shows: the card view renders the user's own sentence, in the
    // region they chose, with nothing of the recorded draft anywhere on it.
    const view = cardViewForPayload(session.card);
    const displayed = view.rows.map((row) => row.display).join(" | ");

    assert.equal(view.usedFallback, false);
    assert.equal(displayed.includes("a dull ache behind my eyes"), true);
    assert.equal(displayed.includes("head"), true);
    assert.equal(displayed.includes("scarf"), false);
    assert.equal(displayed.includes("shoulder"), false);
  });

  it("puts no word on the card that the user did not type", () => {
    const sessions: readonly (readonly string[])[] = [
      ["a dull ache behind my eyes", "like a foggy window", "for two days"],
      ["tight and heavy", "like a scarf knotted too tight", "since this morning"],
      ["a cold knot low in my belly", "like a stone sitting there", "on and off for weeks"],
      ["buzzing, humming, fizzing under the skin", "like a phone on vibrate", "since yesterday"],
    ];

    for (const texts of sessions) {
      const card = mockCardFrom({ answers: answersFor(texts), regionLabel: "chest" });
      const spoken = texts.join(" ").toLowerCase();

      for (const word of card.quality_words) {
        assert.equal(spoken.includes(word.toLowerCase()), true, `${word} in ${JSON.stringify(texts)}`);
      }

      for (const value of [card.user_own_sentence, card.duration, card.intensity_metaphor]) {
        if (value.length === 0) continue;

        assert.equal(texts.includes(value), true, `${value} in ${JSON.stringify(texts)}`);
      }

      assert.equal(card.location_label === "" || REGION_LABELS.includes(card.location_label), true);
      assert.equal(card.quality_words.length <= 5, true);
      assert.equal(sensationCardSchema.safeParse(card).success, true);
    }
  });
});

describe("every region reaches the card", () => {
  it("keeps all fourteen labels, end to end through the state machine", () => {
    assert.equal(REGION_LABELS.length, 14);

    for (const label of REGION_LABELS) {
      const session = completeSession(["a dull ache behind my eyes", "like a foggy window", "for two days"], label);

      assert.equal(session.card.location_label, label);
    }
  });

  it("refuses a region label the fixed map does not have", () => {
    assert.equal(regionLabelFrom("elbow"), "");
    assert.equal(regionLabelFrom("shoulders"), "");
    assert.equal(regionLabelFrom("head "), "");
    assert.equal(regionLabelFrom("Head"), "");
    assert.equal(regionLabelFrom(7), "");
    assert.equal(regionLabelFrom(undefined), "");

    for (const label of REGION_LABELS) assert.equal(regionLabelFrom(label), label);
  });
});

describe("no recorded value can reach another session's card", () => {
  it("shows the user's words where the recorded draft's words used to appear", () => {
    const session = completeSession(
      ["a cold knot low in my belly", "like a stone sitting there", "on and off for weeks"],
      "abdomen",
    );
    const rendered = JSON.stringify(session.card);

    // Every distinctive value from the recorded draft, which used to be shown as the user's own.
    for (const value of [
      interviewFixture.draft_card.intensity_metaphor,
      interviewFixture.draft_card.duration,
      interviewFixture.draft_card.user_own_sentence,
    ]) {
      assert.equal(rendered.includes(value), false, value);
    }

    // The fixture's two quality words are ordinary English words, so they may appear only when the
    // user typed them. This session did not.
    assert.equal(session.card.quality_words.includes("tight"), false);
    assert.equal(session.card.quality_words.includes("heavy"), false);

    assert.equal(session.card.location_label, "abdomen");
    assert.equal(session.card.user_own_sentence, "a cold knot low in my belly");
    assert.equal(session.card.duration, "on and off for weeks");
  });
});

describe("an empty session produces an empty card", () => {
  it("leaves the fields the user did not fill empty, and renders them as not answered", () => {
    const session = completeSession(["", "", ""]);

    assert.deepEqual(session.card, {
      location_label: "",
      quality_words: [],
      intensity_metaphor: "",
      duration: "",
      user_own_sentence: "",
    });

    const view = cardViewForPayload(session.card);
    const unanswered = view.rows.filter((row) => row.display === CARD_NOT_ANSWERED);

    assert.equal(view.usedFallback, false);
    assert.equal(unanswered.length, view.rows.length);
  });
});

describe("the boundary's two substitutions", () => {
  it("lets the user's own region win over the draft's location", () => {
    assert.equal(
      preserveUserSelection(interviewFixture.draft_card, { answers: [], regionLabel: "knees" }).location_label,
      "knees",
    );
    // No region selected: the draft is left exactly as it is - there is nothing to preserve.
    assert.deepEqual(preserveUserSelection(interviewFixture.draft_card, { answers: [] }), interviewFixture.draft_card);
    assert.deepEqual(
      preserveUserSelection(interviewFixture.draft_card, { answers: [], regionLabel: "elbow" }),
      interviewFixture.draft_card,
    );
  });

  it("fills the reviewed fallback's placeholders with the session's own values", () => {
    const filled = withFallbackFidelity(FALLBACK_CARD, {
      answers: [
        { questionId: "Q1", text: "a dull ache behind my eyes" },
        { questionId: "Q12", text: "for two days" },
      ],
      regionLabel: "head",
    });

    assert.equal(filled.location_label, "head");
    assert.equal(filled.user_own_sentence, "a dull ache behind my eyes");
    assert.equal(filled.duration, "for two days");
    assert.deepEqual(filled.quality_words, FALLBACK_CARD.quality_words);
    assert.equal(filled.intensity_metaphor, FALLBACK_CARD.intensity_metaphor);
    assert.equal(sensationCardSchema.safeParse(filled).success, true);

    // A session with nothing to offer leaves the reviewed placeholders in place, and the card view
    // renders those rows as explicitly unanswered rather than as the user's answers.
    assert.deepEqual(withFallbackFidelity(FALLBACK_CARD, { answers: [] }), FALLBACK_CARD);
  });
});

