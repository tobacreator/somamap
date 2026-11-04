import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isComparisonShaped, mockCardFrom } from "./cardFidelity.ts";
import { cardViewForPayload, displayRows } from "./cardView.ts";
import { interviewStep as stateMachine, questionForStep, type InterviewDeps, type InterviewStepResult } from "./interview.ts";
import { acknowledgementFor } from "./externalProcessing.ts";

/**
 * A turn as a real client sends it (Phase 2D): the interview's own fields, plus the acknowledgement of
 * the provider the user was told about before the interview started. `stateMachine` is the raw call,
 * and the tests that prove what happens *without* an acknowledgement use it directly.
 */
function acknowledgedTurn(body: unknown, depsForTurn: InterviewDeps): Promise<InterviewStepResult> {
  const acknowledged =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? { ...body, acknowledgedProvider: acknowledgementFor(depsForTurn.mode) }
      : body;

  return stateMachine(acknowledged, depsForTurn);
}
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

/**
 * Drive a full three-answer session through the real state machine.
 *
 * Asynchronous because the state machine is (Phase 1, the async foundation): it awaits the
 * wording of the card, so every caller of this helper awaits it too.
 */
async function runSession(answers: readonly string[], regionLabel = "chest"): Promise<InterviewStepResult> {
  let result = await acknowledgedTurn({ answers: [], regionLabel }, DEPS);

  for (const text of answers) {
    const previous =
      result.status === "asking" || result.status === "complete" ? result.answers : [];

    result = await acknowledgedTurn(
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
/** A whole answer that carries a duration expression: the row holds the expression, not the sentence. */
const DURATION = "It has been there for about three days now.";
/** What `How long` shows for `DURATION` - the user's own phrase, quoted verbatim. */
const DURATION_EXPRESSION = "about three days";

describe("CF-01..CF-04: a submitted comparison and a submitted duration reach their own fields", () => {
  it("CF-01: a comparison answer lands verbatim in intensity_metaphor", () => {
    const card = mockCardFrom({ answers: [{ questionId: "Q4", text: COMPARISON }], regionLabel: "chest" });

    assert.equal(card.intensity_metaphor, COMPARISON, "the comparison must be copied verbatim");
    assert.equal(card.duration, "", "a comparison is not a duration");
  });

  it("CF-02: a duration answer's expression lands in duration, quoted verbatim", () => {
    const card = mockCardFrom({ answers: [{ questionId: "Q12", text: DURATION }], regionLabel: "chest" });

    assert.equal(card.duration, DURATION_EXPRESSION, "the user's own expression, quoted verbatim");
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
    assert.equal(card.duration, DURATION_EXPRESSION);
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

    assert.equal(card.duration, DURATION_EXPRESSION);
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
  it("CF-07: a session that volunteers both fills both card rows", async () => {
    // The duration is the first answer: the comparison question's answer is never read as a duration
    // (`ISS-16/E`), so a duration has to come from a question that was not asking for a comparison.
    const result = await runSession([DURATION, COMPARISON, "It spreads across my upper back."]);

    assert.equal(result.status, "complete");
    if (result.status !== "complete") return;

    assert.equal(result.card.intensity_metaphor, COMPARISON);
    assert.equal(result.card.duration, DURATION_EXPRESSION);
    assert.equal(result.card.location_label, "chest");

    for (const field of ["location_label", "quality_words", "intensity_metaphor", "duration", "user_own_sentence"]) {
      assert.equal(rowFor(result.card, field)?.answered, true, `${field} should be answered`);
    }
  });
});


describe("CF-08..CF-10: reported defects, characterised rather than fixed", () => {
  it("CF-08 (ISS-02, resolved): the session asks the approved comparison question", async () => {
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
    const result = await runSession(["It stays in one spot.", "Tight.", "A heavy blanket resting on my chest."]);

    assert.equal(result.status, "complete");
    if (result.status !== "complete") return;

    assert.equal(result.card.intensity_metaphor, "A heavy blanket resting on my chest.");
    assert.equal(result.card.duration, "", "no duration was asked for, so none is invented");
    assert.equal(rowFor(result.card, "duration")?.display, "Not answered yet");
    assert.equal(rowFor(result.card, "intensity_metaphor")?.answered, true);
  });

  it("CF-16: the comparison question's answer is the metaphor when it is comparison-shaped", () => {
    // `ISS-16/D` made this conditional rather than automatic: the answer to the comparison question
    // still fills the row, but only because it describes something. The refusals are CF-22 to CF-24.
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
    // The row holds the expression inside the answer, quoted verbatim, not the sentence around it.
    for (const [phrase, expression] of [
      ["For about three hours.", "about three hours"],
      ["It has been present for three hours.", "three hours"],
    ]) {
      const card = mockCardFrom({ answers: [{ questionId: "Q12", text: phrase }], regionLabel: "chest" });

      assert.equal(card.duration, expression, `${JSON.stringify(phrase)} carries ${JSON.stringify(expression)}`);
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
    // The duration comes from a question that was not asking for a comparison (`ISS-16/E`), so that it
    // can reach the duration row at all; the sentence is then the longest of what is left.
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "It spreads across my upper back and down both arms." },
        { questionId: "Q4", text: "It feels like a tight band." },
        { questionId: "Q12", text: "It has been there for about three days now." },
      ],
      regionLabel: "upper back",
    });

    assert.equal(card.duration, DURATION_EXPRESSION);
    assert.equal(
      card.user_own_sentence,
      "It spreads across my upper back and down both arms.",
      "the duration is not repeated",
    );
    assert.notEqual(card.user_own_sentence, card.duration);
  });

  it("CF-20 (ISS-05, ISS-16/B): a one-answer session is never repeated across two rows", () => {
    const card = mockCardFrom({
      answers: [{ questionId: "Q1", text: "It has been like this for three days." }],
      regionLabel: "chest",
    });

    // The duration row holds the expression, so the two rows no longer hold the same text: the
    // sentence keeps the user's whole answer, and `How long` keeps the expression inside it.
    assert.equal(card.duration, "three days");

    assert.equal(card.user_own_sentence, "It has been like this for three days.");
    assert.notEqual(card.user_own_sentence, card.duration, "the two rows never show the same text");
    assert.equal(rowFor(card, "duration")?.answered, true);
    assert.equal(rowFor(card, "user_own_sentence")?.answered, true);
  });
});

describe("ISS-16: the owner-approved fidelity decisions", () => {
  /** The description a session wrote on the check-in screen before any question was asked. */
  const DESCRIPTION = "A heavy band across my chest since this morning.";

  it("CF-21 (B): the comparison and the sentence are never the same text", () => {
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "tight and heavy" },
        { questionId: "Q4", text: "like a scarf knotted too tight" },
        { questionId: "Q14", text: "since this morning" },
      ],
      regionLabel: "chest",
    });

    assert.equal(card.intensity_metaphor, "like a scarf knotted too tight");
    assert.equal(card.user_own_sentence, "since this morning");
    assert.notEqual(card.user_own_sentence, card.intensity_metaphor);
    assert.notEqual(card.user_own_sentence, card.duration);
    assert.notEqual(card.intensity_metaphor, card.duration);
  });

  it("CF-22 (D): 'Maybe' cannot populate the metaphor", () => {
    const card = mockCardFrom({ answers: [{ questionId: "Q14", text: "Maybe" }], regionLabel: "chest" });

    assert.equal(card.intensity_metaphor, "");
    assert.equal(rowFor(card, "intensity_metaphor")?.display, "Not answered yet");
  });

  it("CF-23 (D, E): 'Since this morning' is neither a metaphor nor a duration, but is not lost", () => {
    const card = mockCardFrom({ answers: [{ questionId: "Q14", text: "Since this morning" }], regionLabel: "chest" });

    assert.equal(card.intensity_metaphor, "", "a time phrase is not a comparison");
    assert.equal(card.duration, "", "the comparison question's answer is not read as a duration");
    // The user's words are still on the card - in the row that does not claim they said something else.
    assert.equal(card.user_own_sentence, "Since this morning");
  });

  it("CF-24 (D): 'All week' cannot populate the metaphor either", () => {
    const card = mockCardFrom({ answers: [{ questionId: "Q14", text: "All week" }], regionLabel: "chest" });

    assert.equal(card.intensity_metaphor, "");
    assert.equal(rowFor(card, "intensity_metaphor")?.display, "Not answered yet");
  });

  it("CF-25 (D): a comparison-shaped answer to the comparison question still fills the row", () => {
    const card = mockCardFrom({
      answers: [{ questionId: "Q14", text: "Like a scarf knotted too tight" }],
      regionLabel: "chest",
    });

    assert.equal(card.intensity_metaphor, "Like a scarf knotted too tight");
    assert.equal(rowFor(card, "intensity_metaphor")?.answered, true);
  });

  it("CF-26 (E): a comparison answer is never mislabelled as a duration", () => {
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "It stays in one spot." },
        { questionId: "Q4", text: "Tight." },
        { questionId: "Q14", text: "It has been like this for three days." },
      ],
      regionLabel: "chest",
    });

    // It carries a time expression, but it answered a question that asked for a comparison.
    assert.equal(card.duration, "");
    assert.equal(rowFor(card, "duration")?.display, "Not answered yet");
    assert.equal(card.intensity_metaphor, "It has been like this for three days.");
  });

  it("CF-27 (C): no time expression reaches quality_words, alone or inside a sentence", () => {
    for (const phrase of ["this morning", "yesterday", "all week", "for two hours", "on and off"]) {
      const card = mockCardFrom({ answers: [{ questionId: "Q1", text: phrase }], regionLabel: "chest" });

      assert.deepEqual(card.quality_words, [], `${JSON.stringify(phrase)} has no quality word in it`);
      assert.equal(rowFor(card, "quality_words")?.display, "Not answered yet");
    }

    const embedded = mockCardFrom({
      answers: [{ questionId: "Q1", text: "it started recently and is still here" }],
      regionLabel: "chest",
    });

    assert.deepEqual(embedded.quality_words, ["started"], "the time word goes, the description stays");
  });

  it("CF-28 (C): a descriptive word beside a time expression is not removed with it", () => {
    const card = mockCardFrom({ answers: [{ questionId: "Q1", text: "a heavy band all week" }], regionLabel: "chest" });

    assert.deepEqual(card.quality_words, ["heavy", "band"]);
  });

  it("CF-29 (16): one repeated answer does not fill three rows", () => {
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "tight" },
        { questionId: "Q4", text: "tight" },
        { questionId: "Q14", text: "tight" },
      ],
      regionLabel: "chest",
    });

    // Correction 3: the session's whole text is the one word "tight", and "In your words" already
    // shows it. A vocabulary row holding exactly the words of a phrase the card shows in full adds
    // nothing, so it is left unanswered rather than repeating the row below it. The word is not lost:
    // it is still quoted verbatim as the sentence.
    assert.deepEqual(card.quality_words, [], "the row does not repeat the sentence in full");
    assert.equal(card.intensity_metaphor, "", "a single word is not a comparison");
    assert.equal(card.duration, "");
    assert.equal(card.user_own_sentence, "tight");
  });

  it("CF-29b (16): an empty session still produces an empty card", () => {
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "" },
        { questionId: "Q4", text: "   " },
        { questionId: "Q14", text: "" },
      ],
      regionLabel: "chest",
    });

    assert.deepEqual(card, {
      location_label: "chest",
      quality_words: [],
      intensity_metaphor: "",
      duration: "",
      user_own_sentence: "",
    });
  });

  it("CF-29c (16): conflicting answers each land in the row their own content earns", () => {
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "since yesterday" },
        { questionId: "Q4", text: "like a stone sitting there" },
        { questionId: "Q14", text: "maybe" },
      ],
      regionLabel: "chest",
    });

    assert.equal(card.duration, "since yesterday");
    assert.equal(card.intensity_metaphor, "like a stone sitting there");
    // The only text left is the comparison question's own answer, quoted as itself - not promoted into
    // a row it does not belong in, and not rewritten to make a longer sentence.
    assert.equal(card.user_own_sentence, "maybe");
  });

  it("CF-30 (A, correction 1): the description reaches the card, quoted verbatim", () => {
    const answers = [
      { questionId: "Q1", text: "tight" },
      { questionId: "Q4", text: "like a scarf" },
      { questionId: "Q14", text: "since this morning" },
    ];

    const withDescription = mockCardFrom({ answers, regionLabel: "chest", description: DESCRIPTION });
    const without = mockCardFrom({ answers, regionLabel: "chest" });

    assert.equal(withDescription.user_own_sentence, DESCRIPTION, "the description is quoted exactly");
    assert.notEqual(without.user_own_sentence, DESCRIPTION, "and only when the user wrote one");

    // It does not displace an answer from a row that answer earned, and it is never rewritten or merged
    // with one.
    assert.equal(withDescription.intensity_metaphor, without.intensity_metaphor);
    assert.equal(withDescription.duration, without.duration);
  });

  it("CF-30b (A): an absent or blank description changes nothing", () => {
    const answers = [{ questionId: "Q1", text: "a heavy band" }];
    const plain = mockCardFrom({ answers, regionLabel: "chest" });

    assert.deepEqual(mockCardFrom({ answers, regionLabel: "chest", description: "" }), plain);
    assert.deepEqual(mockCardFrom({ answers, regionLabel: "chest", description: "   " }), plain);
  });

  it("CF-31 (correction 1): a longer answer never displaces the description", () => {
    // The owner's decision: the description is the user's own first account of the sensation, so the
    // card quotes it whenever there is one - it may not be swapped for a longer answer.
    const longer = "It spreads across my upper back and down both arms and it is still there.";
    const description = "A heavy band, right here!";

    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: longer },
        { questionId: "Q4", text: "like a scarf knotted too tight" },
        { questionId: "Q14", text: "steady" },
      ],
      regionLabel: "chest",
      description,
    });

    assert.ok(longer.length > description.length, "the answer really is the longer text");
    assert.equal(card.user_own_sentence, description, "the description is quoted, not the longer answer");
    // Verbatim: punctuation, capitalisation and sentence structure all survive, and nothing is merged
    // with an answer.
    assert.equal(card.user_own_sentence, "A heavy band, right here!");
    assert.equal(card.intensity_metaphor, "like a scarf knotted too tight");
  });

  it("CF-31b (correction 1): the description is copied whole, trimmed only around it", () => {
    const description = "  A heavy band, right here! Not going away.  ";

    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "It spreads across my upper back and down both arms." },
        { questionId: "Q4", text: "like a scarf knotted too tight" },
        { questionId: "Q14", text: "steady" },
      ],
      regionLabel: "chest",
      description,
    });

    assert.equal(card.user_own_sentence, "A heavy band, right here! Not going away.");
    assert.equal(card.user_own_sentence, description.trim(), "never reworded, re-punctuated or merged");
  });

  it("CF-32 (correction 3): words that only repeated the comparison are not shown again", () => {
    // The owner's UAT: the comparison row and the words row carried the same words. A word whose only
    // source is the phrase now shown under "It feels like" adds no vocabulary the card does not
    // already show in full, so it is not listed a second time. A word that also came from another
    // answer stays, because that answer is nowhere else on the card.
    const card = mockCardFrom({
      answers: [
        { questionId: "Q1", text: "a dull ache" },
        { questionId: "Q4", text: "like a tight band around my chest" },
      ],
      regionLabel: "chest",
    });

    assert.equal(card.intensity_metaphor, "like a tight band around my chest");
    assert.deepEqual(
      card.quality_words,
      ["dull", "ache"],
      '"tight", "band" and "chest" are already on the card, in full, in the row above',
    );
    assert.equal(card.user_own_sentence, "a dull ache");
  });

  it("CF-33 (correction 3, correction 4): \"big bang\" is neither a comparison nor a word list", () => {
    // The owner's UAT, reproduced. The two-word answer to the comparison question is refused as a
    // comparison (correction 4), so that row stays honestly empty; and because the same two words are
    // then all the card would show of the answer, the vocabulary row does not spell it out again
    // (correction 3). Nothing is lost - the user's own words are quoted verbatim under "In your words".
    const card = mockCardFrom({
      answers: [{ questionId: "Q14", text: "big bang" }],
      regionLabel: "chest",
    });

    assert.equal(card.intensity_metaphor, "", "a bare two-word phrase is not a comparison");
    assert.deepEqual(card.quality_words, [], "the row does not reproduce the sentence in full");
    assert.equal(card.user_own_sentence, "big bang", "the user's words are still on the card, verbatim");
    assert.equal(card.duration, "", "and nothing was invented for the row that was never asked about");
  });

  it("CF-34 (correction 4): the comparison contract's floor, and what it still accepts", () => {
    // Each refusal is for what the answer *lacks* - a resemblance, a description, enough structure -
    // never for looking unusual.
    for (const refused of ["big bang", "Maybe", "Since this morning", "All week", "not sure"]) {
      assert.equal(isComparisonShaped(refused), false, `${JSON.stringify(refused)} is not a comparison`);
    }

    // A stated resemblance is a resemblance at any length, and a description only has to carry enough
    // words to describe something.
    for (const accepted of [
      "like a big bang",
      "Like a scarf knotted too tight",
      "A heavy blanket resting on my chest.",
    ]) {
      assert.equal(isComparisonShaped(accepted), true, `${JSON.stringify(accepted)} is a comparison`);
    }

    // The floor is about structure, not about meaning, and it is deliberately not a parser: a
    // three-word phrase passes it whatever its words are. Judging whether "a big bang" describes a
    // sensation is a vocabulary question, and it belongs to the Vocabulary Library task - not here.
    assert.equal(isComparisonShaped("a big bang"), true, "three words pass the floor");
  });
});

describe("CF-35: the duration row holds the expression, not the sentence around it", () => {
  /**
   * The examples this correction was specified with, and what `How long` must show for each.
   *
   * One row differs from the brief's table by a single character: for "Since yesterday morning." the
   * brief wrote "since yesterday morning", while the row shows **"Since yesterday morning"**. The row
   * quotes the user's own words, and this card never re-cases a word it was given - the capital is
   * theirs, exactly as `user_own_sentence` keeps it. Dropping it would be a one-line change in
   * `durationExpressionIn` if the owner prefers the sentence-initial capital removed.
   */
  const EXAMPLES: readonly (readonly [string, string])[] = [
    ["It has been there for about three days now.", "about three days"],
    ["I've felt it for two weeks.", "two weeks"],
    ["Since yesterday morning.", "Since yesterday morning"],
    ["It started around 6 AM.", "around 6 AM"],
    ["on and off for weeks", "weeks"],
    ["It has been happening on and off for several weeks.", "several weeks"],
    ["It comes and goes.", ""],
    ["It stays in one spot.", ""],
  ];

  it("shows the expression the user wrote, and nothing else", () => {
    for (const [answer, expected] of EXAMPLES) {
      const card = mockCardFrom({ answers: [{ questionId: "Q1", text: answer }], regionLabel: "chest" });

      assert.equal(card.duration, expected, `${JSON.stringify(answer)} -> ${JSON.stringify(expected)}`);
    }
  });

  it("names the time unit, not the pattern the sensation follows", () => {
    /**
     * "on and off" describes how a sensation behaves; it does not say how long it has been there. The
     * row must name the unit, so a pattern is never the anchor - and an answer that mentions only the
     * pattern leaves the row honestly empty rather than claiming a length of time.
     */
    for (const [answer, expected] of [
      ["on and off for weeks", "weeks"],
      ["It has been happening on and off for several weeks.", "several weeks"],
      ["It has been on and off.", ""],
      ["It comes and goes.", ""],
    ]) {
      const card = mockCardFrom({ answers: [{ questionId: "Q1", text: answer }], regionLabel: "chest" });

      assert.equal(card.duration, expected, `${JSON.stringify(answer)} -> ${JSON.stringify(expected)}`);
    }
  });

  it("never shows a word the user did not write", () => {
    for (const [answer] of EXAMPLES) {
      const card = mockCardFrom({ answers: [{ questionId: "Q1", text: answer }], regionLabel: "chest" });

      if (card.duration.length === 0) continue;

      assert.equal(answer.includes(card.duration), true, `${card.duration} is inside ${JSON.stringify(answer)}`);
    }
  });

  it("guesses nothing from an answer that carries no time expression", () => {
    for (const answer of [
      "It comes and goes.",
      "It stays in one spot.",
      "Tight and heavy.",
      // The ISS-03 regression phrases: a bare "for" is not a duration, and neither is a sentence
      // that merely contains one.
      "I have been waiting for it to pass.",
      "I am looking for a word for it.",
      "It hurts when I reach for things.",
    ]) {
      const card = mockCardFrom({ answers: [{ questionId: "Q1", text: answer }], regionLabel: "chest" });

      assert.equal(card.duration, "", `${JSON.stringify(answer)} carries no duration`);
    }
  });

  it("leaves the row empty and hidden when there is no expression to show", () => {
    for (const [answer, expected] of EXAMPLES) {
      if (expected.length > 0) continue;

      const card = mockCardFrom({ answers: [{ questionId: "Q1", text: answer }], regionLabel: "chest" });
      const rendered = displayRows(cardViewForPayload(card));

      assert.equal(card.duration, "");
      assert.equal(rowFor(card, "duration")?.display, "Not answered yet");
      assert.equal(rendered.some((row) => row.field === "duration"), false, "the unanswered row is hidden");
      assert.equal(rendered.length, 4, "the other four rows still render");
    }
  });
});

describe("CF-36 (ISS-23): the words of not knowing are not shown as chosen vocabulary", () => {
  /**
   * The owner's own sentence, reported from a manual session: the card showed "don't", "know" and
   * "describe" under "Words you chose", because a person saying they had no words for the sensation had
   * their sentence read as vocabulary. The words are theirs, but they describe no quality of anything.
   *
   * The rule is a rejection list: it can only ever leave a word out of the row, never put one in, and
   * the sentence itself is untouched - `user_own_sentence` still quotes it verbatim, which is what the
   * card exists to keep.
   */
  const NO_WORDS = "I feel something, but I don't know how to describe it.";

  it("keeps the sentence verbatim and leaves the uncertainty words out of quality_words", () => {
    const card = mockCardFrom({
      answers: [{ questionId: "Q4", text: "tingling, fluttering" }],
      regionLabel: "chest",
      description: NO_WORDS,
    });

    assert.deepEqual(card.quality_words, ["tingling", "fluttering"]);
    assert.equal(card.user_own_sentence, NO_WORDS, "their sentence, quoted whole");
    assert.deepEqual(Object.keys(card).sort(), [
      "duration",
      "intensity_metaphor",
      "location_label",
      "quality_words",
      "user_own_sentence",
    ]);
  });

  it("leaves the row honestly empty when the session holds nothing but not knowing", () => {
    const card = mockCardFrom({ answers: [{ questionId: "Q4", text: NO_WORDS }], regionLabel: "chest" });

    assert.deepEqual(card.quality_words, []);
    assert.equal(rowFor(card, "quality_words")?.display, "Not answered yet");
    assert.equal(card.user_own_sentence, NO_WORDS);
  });

  it("keeps the words a person chose even when they also say they do not know", () => {
    // The rejection list is narrow: a description standing beside an uncertainty word keeps its place.
    for (const [answer, expected] of [
      ["I don't know, a heavy band", ["heavy", "band"]],
      ["Maybe tight, maybe loose", ["tight", "loose"]],
      ["I can't describe it - a dull ache", ["dull", "ache"]],
    ] as const) {
      const card = mockCardFrom({ answers: [{ questionId: "Q1", text: answer }], regionLabel: "chest" });

      assert.deepEqual(card.quality_words, expected, `${JSON.stringify(answer)} keeps its own words`);
      assert.equal(card.user_own_sentence, answer);
    }
  });
});

