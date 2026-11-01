import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mockCardFrom } from "./cardFidelity.ts";
import { cardViewForPayload } from "./cardView.ts";
import { interviewStep, questionForStep, type InterviewStepResult } from "./interview.ts";
import { mockAdapter } from "./models.ts";

/**
 * Controlled card-fidelity cases (Phase 2 documentation work, requirement 5).
 *
 * What these prove, and what they deliberately do not:
 *
 *   - CF-01 to CF-04 verify the **contract**: an answer the user submits as a comparison reaches
 *     `intensity_metaphor`, an answer that carries a time phrase reaches `duration`, and the two
 *     never swap, in either order. This is the card-fidelity behaviour the product depends on.
 *   - CF-05 and CF-06 verify the **negative**: when the user supplies neither, the field stays
 *     empty and the screen says "Not answered yet". Nothing is invented, which is iron rule 1.
 *   - CF-07 drives the real state machine (`interviewStep`) with the mock adapter, so the whole
 *     path - parse, screen, sequence, word the card - is exercised rather than the helper alone.
 *   - CF-08, CF-09 and CF-10 are **characterisations**, not endorsements. They pin behaviour that
 *     has been reported as a defect (ISS-02, ISS-03, ISS-04 in docs/mvp/ISSUES-AND-BLOCKERS.md) so
 *     that it is visible and cannot change by accident. If the owner decides to fix one of them,
 *     the assertion below is the line that changes - deliberately, not silently.
 *
 * No schema field was added, no answer is invented, and no existing test or compliance rule was
 * weakened to make these pass.
 */

const DEPS = { adapter: mockAdapter, logger: () => {}, mode: "mock" as const };

/** Drive a full three-answer session through the real state machine. */
function runSession(answers: readonly string[], regionLabel = "chest"): InterviewStepResult {
  let result = interviewStep({ answers: [], regionLabel }, DEPS);

  for (const text of answers) {
    const previous =
      result.status === "asking" || result.status === "complete" ? result.answers : [];

    result = interviewStep(
      {
        answers: previous.map((answer: { questionId: string; text: string }) => ({
          questionId: answer.questionId,
          text: answer.text,
        })),
        text,
        regionLabel,
      },
      DEPS,
    );
  }

  return result;
}

/** The rendered row for one field, as the card screen shows it. */
function rowFor(card: unknown, field: string) {
  return cardViewForPayload(card).rows.find((row) => row.field === field);
}

const COMPARISON = "It feels like a tight band.";
const DURATION = "It has been there for about three days now.";

describe("CF-01..CF-04: a submitted comparison and a submitted duration reach their own fields", () => {
  it("CF-01: a comparison answer lands verbatim in intensity_metaphor", () => {
    const card = mockCardFrom({ answers: [{ questionId: "Q4", text: COMPARISON }], regionLabel: "chest" });

    assert.equal(card.intensity_metaphor, COMPARISON, "the comparison must be copied verbatim");
    assert.equal(card.duration, "", "a comparison is not a duration");
  });

  it("CF-02: a duration answer lands verbatim in duration", () => {
    const card = mockCardFrom({ answers: [{ questionId: "Q12", text: DURATION }], regionLabel: "chest" });

    assert.equal(card.duration, DURATION, "the duration must be copied verbatim");
    assert.equal(card.intensity_metaphor, "", "a duration is not a comparison");
  });

  it("CF-03: with the comparison first, both land in their own fields", () => {
    const card = mockCardFrom({
      answers: [
        { questionId: "Q4", text: COMPARISON },
        { questionId: "Q12", text: DURATION },
      ],
      regionLabel: "upper back",
    });

    assert.equal(card.intensity_metaphor, COMPARISON);
    assert.equal(card.duration, DURATION);
    assert.equal(card.location_label, "upper back");
  });

  it("CF-04: with the duration first, both still land in their own fields", () => {
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: DURATION },
        { questionId: "Q4", text: COMPARISON },
      ],
      regionLabel: "thighs",
    });

    assert.equal(card.duration, DURATION);
    assert.equal(card.intensity_metaphor, COMPARISON);
    assert.equal(card.location_label, "thighs");
  });
});

describe("CF-05..CF-06: an answer the user did not give is never invented", () => {
  it("CF-05: with no comparison, intensity_metaphor is empty and renders as not answered", () => {
    const card = mockCardFrom({ answers: [{ questionId: "Q1", text: "It stays in one spot." }], regionLabel: "chest" });

    assert.equal(card.intensity_metaphor, "");
    assert.equal(rowFor(card, "intensity_metaphor")?.answered, false);
    assert.equal(rowFor(card, "intensity_metaphor")?.display, "Not answered yet");
  });

  it("CF-06: with no time phrase, duration is empty and renders as not answered", () => {
    const card = mockCardFrom({ answers: [{ questionId: "Q1", text: "It stays in one spot." }], regionLabel: "chest" });

    assert.equal(card.duration, "");
    assert.equal(rowFor(card, "duration")?.answered, false);
    assert.equal(rowFor(card, "duration")?.display, "Not answered yet");
  });
});

describe("CF-07: the whole path, through the real state machine", () => {
  it("CF-07: a session that volunteers both fills both card rows", () => {
    const result = runSession(["It spreads across my upper back.", COMPARISON, DURATION]);

    assert.equal(result.status, "complete");
    if (result.status !== "complete") return;

    assert.equal(result.card.intensity_metaphor, COMPARISON);
    assert.equal(result.card.duration, DURATION);
    assert.equal(result.card.location_label, "chest");

    for (const field of ["location_label", "quality_words", "intensity_metaphor", "duration", "user_own_sentence"]) {
      assert.equal(rowFor(result.card, field)?.answered, true, `${field} should be answered`);
    }
  });
});


describe("CF-08..CF-10: reported defects, characterised rather than fixed", () => {
  it("CF-08 (ISS-02, resolved): the session asks the approved comparison question", () => {
    // ISS-02's resolution: the third question is now the owner-approved comparison question, so the
    // session asks for the comparison the card's intensity_metaphor row needs. The wording is the
    // owner's, verbatim, and it comes from the bank like every other question.
    const asked = [0, 1, 2].map((step) => questionForStep(step, mockAdapter));

    assert.deepEqual(
      asked.map((q) => q.id),
      ["Q1", "Q4", "Q14"],
    );
    assert.equal(asked[2].text, "What does it remind you of?");

    for (const question of asked) {
      assert.equal(/\bhow long\b/i.test(question.text), false, `${question.id} must not ask how long`);
    }

    // The consequence, measured: a plain three-answer session now fills the comparison row from the
    // comparison question's own answer, and the duration row stays honestly empty because no question
    // asks for a duration (the owner's decision).
    const result = runSession(["It stays in one spot.", "Tight.", "A heavy blanket resting on my chest."]);

    assert.equal(result.status, "complete");
    if (result.status !== "complete") return;

    assert.equal(result.card.intensity_metaphor, "A heavy blanket resting on my chest.");
    assert.equal(result.card.duration, "", "no duration was asked for, so none is invented");
    assert.equal(rowFor(result.card, "duration")?.display, "Not answered yet");
    assert.equal(rowFor(result.card, "intensity_metaphor")?.answered, true);
  });

  it("CF-16: the comparison question's answer is the metaphor even without the word 'like'", () => {
    const card = mockCardFrom({
      answers: [{ questionId: "Q14", text: "A heavy blanket resting on my chest." }],
      regionLabel: "chest",
    });

    assert.equal(card.intensity_metaphor, "A heavy blanket resting on my chest.");
  });

  it("CF-17: a comparison volunteered elsewhere still fills the metaphor row", () => {
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "It stays in one spot." },
        { questionId: "Q4", text: "It feels like a tight band." },
      ],
      regionLabel: "chest",
    });

    assert.equal(card.intensity_metaphor, "It feels like a tight band.");
  });

  it("CF-18: with no comparison anywhere, the metaphor row stays empty", () => {
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "It stays in one spot." },
        { questionId: "Q4", text: "Smooth." },
      ],
      regionLabel: "chest",
    });

    assert.equal(card.intensity_metaphor, "", "nothing is inferred from an unrelated answer");
    assert.equal(rowFor(card, "intensity_metaphor")?.display, "Not answered yet");
  });

  it("CF-09 (ISS-03, fixed): a bare 'for' is no longer read as a duration", () => {
    // ISS-03: the bare preposition "for" was in the locator's word list, so an ordinary sentence was
    // presented as the answer to "How long". The fix removes it; these are the exact phrases that
    // used to fail, kept as the regression guard.
    for (const phrase of [
      "I have been waiting for it to pass.",
      "I am looking for a word for it.",
      "It hurts when I reach for things.",
    ]) {
      const card = mockCardFrom({ answers: [{ questionId: "Q1", text: phrase }], regionLabel: "chest" });

      assert.equal(card.duration, "", `ISS-03 regression: ${JSON.stringify(phrase)} is not a duration`);
      assert.equal(rowFor(card, "duration")?.display, "Not answered yet");
    }
  });

  it("CF-09b (ISS-03, fixed): a comparison without a time phrase is not a duration either", () => {
    const card = mockCardFrom({
      answers: [{ questionId: "Q4", text: "It feels like a smooth surface." }],
      regionLabel: "chest",
    });

    assert.equal(card.duration, "", "a comparison is not a duration");
    assert.equal(card.intensity_metaphor, "It feels like a smooth surface.", "it is the user's own comparison");
  });

  it("CF-09c (ISS-03): a genuine duration still reaches the duration row", () => {
    for (const phrase of ["For about three hours.", "It has been present for three hours."]) {
      const card = mockCardFrom({ answers: [{ questionId: "Q12", text: phrase }], regionLabel: "chest" });

      assert.equal(card.duration, phrase, `${JSON.stringify(phrase)} is a genuine duration, quoted verbatim`);
    }
  });

  it("CF-09d (ISS-03): a missing duration stays missing", () => {
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "It stays in one spot." },
        { questionId: "Q4", text: "It is like a tight band." },
        { questionId: "Q12", text: "It has softened a little." },
      ],
      regionLabel: "chest",
    });

    assert.equal(card.duration, "", "nothing in the session said how long, so nothing is invented");
  });

  it("CF-10 (ISS-04, fixed): filler is filtered out of quality_words, descriptions are kept", () => {
    // ISS-04: the row labelled "Words you chose" used to show filler ("stays", "one", "spot").
    // The filter now drops numbers and function/spatial words, and keeps descriptions.
    const fillerOnly = mockCardFrom({
      answers: [{ questionId: "Q1", text: "It stays in one spot." }],
      regionLabel: "chest",
    });

    assert.deepEqual(fillerOnly.quality_words, [], "no filler is presented as a quality word");
    assert.equal(rowFor(fillerOnly, "quality_words")?.display, "Not answered yet");
    // The user's words are not lost: their sentence is still quoted verbatim on the card.
    assert.equal(fillerOnly.user_own_sentence, "It stays in one spot.");

    const descriptive = mockCardFrom({
      answers: [{ questionId: "Q1", text: "A tight, heavy band that comes in waves." }],
      regionLabel: "chest",
    });

    assert.deepEqual(descriptive.quality_words, ["tight", "heavy", "band", "waves"]);
    assert.ok(descriptive.quality_words.length <= 5, "the schema caps quality_words at five");
  });

  it("CF-19 (ISS-05, fixed): the quoted sentence does not repeat the duration row", () => {
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "It spreads across my upper back." },
        { questionId: "Q4", text: "It feels like a tight band." },
        { questionId: "Q14", text: "It has been there for about three days now." },
      ],
      regionLabel: "upper back",
    });

    assert.equal(card.duration, "It has been there for about three days now.");
    assert.equal(card.user_own_sentence, "It spreads across my upper back.", "the duration is not repeated");
    assert.notEqual(card.user_own_sentence, card.duration);
  });

  it("CF-20 (ISS-05): a one-answer session still quotes that answer", () => {
    const card = mockCardFrom({
      answers: [{ questionId: "Q1", text: "It has been like this for three days." }],
      regionLabel: "chest",
    });

    assert.equal(card.duration, "It has been like this for three days.");
    assert.equal(card.user_own_sentence, "It has been like this for three days.", "a repeat beats an empty row");
  });
});

