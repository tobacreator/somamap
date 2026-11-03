import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mockCardFrom, type FidelitySource } from "./cardFidelity.ts";
import { prohibitedLanguageIn } from "./draftGuard.ts";
import { mockAdapter, wordCard, type ModelAdapter, type ViolationRecord } from "./models.ts";
import { CAUSAL_PHRASES, CONDITION_NAME_SAMPLE } from "./patterns.ts";
import { FALLBACK_CARD, sensationCardSchema, type SensationCard } from "./schema.ts";

/**
 * The draft guard's tests - Phase 2B, iron rule 1's second sentence.
 *
 * Two properties decide every case here:
 *
 *   1. **Structural grounding has priority.** Phase 2A replaces `location_label`, `duration` and
 *      `user_own_sentence` with the session's own values, so the guard does not judge those fields at
 *      all - it concentrates on the two a model may word, which are the only model values that can
 *      reach the screen.
 *   2. **Provenance is field-specific.** A quality word is the user's only as an exact token they
 *      wrote; a comparison is the user's only as a whole answer they wrote. Nothing is matched by
 *      loose substring containment, because that is how a model can carve "you should rest." out of
 *      "I don't think you should rest." and present the negation-free fragment as the user's own.
 *
 * Every case drives the real boundary (`wordCard`), with a draft that is a **valid** five-field card,
 * so what is proven is the guard rather than the schema's refusal. Nothing here adds a field, a
 * question, or any statement about what a sensation means.
 */

/** The user's session: what they answered, and the region they selected. */
const SESSION: FidelitySource = {
  answers: [
    { questionId: "Q1", text: "Tight and heavy across my shoulders." },
    { questionId: "Q4", text: "Like a scarf knotted too tight." },
    { questionId: "Q14", text: "It stays in one spot." },
  ],
  regionLabel: "shoulder",
};

/** A session whose only answer is instruction-shaped, and negated - the extraction case to defend. */
const NEGATED: FidelitySource = {
  answers: [{ questionId: "Q4", text: "I don't think you should rest." }],
  regionLabel: "chest",
};

/** A valid card carrying the five approved fields and nothing else, so only the guard can refuse it. */
function draft(overrides: Partial<SensationCard> = {}): SensationCard {
  return {
    location_label: "head",
    quality_words: ["tight"],
    intensity_metaphor: "Like a scarf knotted too tight.",
    duration: "for two days",
    user_own_sentence: "Tight and heavy across my shoulders.",
    ...overrides,
  };
}

type Worded = { card: SensationCard; usedFallback: boolean; records: ViolationRecord[] };

/** The boundary, exactly as the route drives it. */
async function cardFrom(draftCard: SensationCard, session: FidelitySource = SESSION): Promise<Worded> {
  const records: ViolationRecord[] = [];
  const adapter: ModelAdapter = { ...mockAdapter, interview: async () => draftCard };
  const worded = await wordCard(session, { adapter, logger: (record) => records.push(record), mode: "mock" });

  return { card: worded.card, usedFallback: worded.usedFallback, records };
}

describe("the guard refuses a draft whose model wording is prohibited (AG-01..AG-10)", () => {
  it("AG-01 refuses a direct instruction in the comparison", async () => {
    const hostile = "You should rest and drink water.";
    const { card, usedFallback, records } = await cardFrom(draft({ intensity_metaphor: hostile }));

    assert.equal(usedFallback, true, "the whole draft is refused");
    assert.equal(records.length, 1);
    assert.equal(records[0].reason, "prohibited-language");
    assert.deepEqual(records[0].keys, ["intensity_metaphor"]);
    assert.notEqual(card.intensity_metaphor, hostile, "nothing of the refused draft reaches the card");
  });

  it("AG-02 refuses an indirect recommendation", async () => {
    const { usedFallback, records } = await cardFrom(
      draft({ intensity_metaphor: "It might be worth having someone look at that." }),
    );

    assert.equal(usedFallback, true);
    assert.deepEqual(records[0].keys, ["intensity_metaphor"]);
  });

  it("AG-03 refuses a paraphrased recommendation", async () => {
    const { usedFallback } = await cardFrom(
      draft({ intensity_metaphor: "Getting more sleep would help this settle." }),
    );

    assert.equal(usedFallback, true);
  });

  it("AG-04 refuses a causal claim", async () => {
    const { usedFallback, records } = await cardFrom(
      draft({ intensity_metaphor: "Like it is because of the desk." }),
    );

    assert.equal(usedFallback, true);
    assert.deepEqual(records[0].keys, ["intensity_metaphor"]);
  });

  it("AG-05 refuses an interpretation", async () => {
    const { usedFallback } = await cardFrom(draft({ intensity_metaphor: "This suggests a tension pattern." }));

    assert.equal(usedFallback, true);
  });

  it("AG-06 refuses a named condition", async () => {
    const { usedFallback } = await cardFrom(draft({ intensity_metaphor: "Like a classic migraine." }));

    assert.equal(usedFallback, true);
  });

  it("AG-07 refuses clinical wording", async () => {
    const { usedFallback } = await cardFrom(
      draft({ intensity_metaphor: "Ask your doctor about medication." }),
    );

    assert.equal(usedFallback, true);
  });

  it("AG-08 refuses a phrase placed in the vocabulary row", async () => {
    const { usedFallback, records } = await cardFrom(draft({ quality_words: ["you should rest"] }));

    assert.equal(usedFallback, true);
    assert.deepEqual(records[0].keys, ["quality_words"]);
  });

  it("AG-09 refuses a single instruction word the user never wrote", async () => {
    const { usedFallback, records } = await cardFrom(draft({ quality_words: ["hydrate"] }));

    assert.equal(usedFallback, true);
    assert.deepEqual(records[0].keys, ["quality_words"]);
  });

  it("AG-10 refuses a fragment that drops the user's negation", async () => {
    // The case the owner named: "you should rest." is an exact substring of the user's own answer, so
    // containment alone would call it theirs. It is not a whole answer, so it is the model's.
    const { usedFallback, records } = await cardFrom(draft({ intensity_metaphor: "you should rest." }), NEGATED);

    assert.equal(usedFallback, true, "a misleading extraction is refused, not shown as the user's");
    assert.deepEqual(records[0].keys, ["intensity_metaphor"]);
  });
});

describe("the user's own words are never a reason to refuse a draft (AG-11..AG-14)", () => {
  it("AG-11 keeps the user's own instruction-shaped answer, as their words", async () => {
    const { usedFallback, records } = await cardFrom(
      draft({ intensity_metaphor: "I don't think you should rest." }),
      NEGATED,
    );

    assert.equal(usedFallback, false, "a whole answer the user wrote is theirs, however it reads");
    assert.deepEqual(records, []);
  });

  it("AG-12 does not judge the three fields the grounding owns", async () => {
    const hostile = "You should take medication and see a doctor.";
    const { card, usedFallback, records } = await cardFrom(
      draft({ location_label: hostile, duration: hostile, user_own_sentence: hostile }),
    );

    assert.equal(usedFallback, false, "the grounding replaces these fields, so the guard does not judge them");
    assert.deepEqual(records, []);
    assert.equal(card.user_own_sentence, SESSION.answers[0].text, "the card shows the user's own words");
    assert.equal(card.location_label, "shoulder", "and the label from the fixed map");
  });

  it("AG-13 keeps a word the user actually typed, however it reads", async () => {
    const session: FidelitySource = {
      answers: [{ questionId: "Q1", text: "rest and water" }],
      regionLabel: "chest",
    };
    const { card, usedFallback, records } = await cardFrom(
      draft({ quality_words: ["rest", "water"], intensity_metaphor: "" }),
      session,
    );

    assert.equal(usedFallback, false);
    assert.deepEqual(records, []);
    assert.deepEqual(card.quality_words, ["rest", "water"]);
  });

  it("AG-14 accepts a safe draft and records nothing", async () => {
    const { usedFallback, records } = await cardFrom(draft());

    assert.equal(usedFallback, false);
    assert.deepEqual(records, []);
  });
});

describe("the refusal itself is safe (AG-15..AG-20)", () => {
  it("AG-15 gives the fallback the user's own words, duration and region", async () => {
    const session: FidelitySource = {
      answers: [
        { questionId: "Q1", text: "for two days" },
        { questionId: "Q4", text: "Like a scarf knotted too tight." },
        { questionId: "Q14", text: "It stays in one spot." },
      ],
      regionLabel: "shoulder",
      description: "A heavy band across my chest.",
    };
    const { card, usedFallback } = await cardFrom(draft({ intensity_metaphor: "You should rest." }), session);

    assert.equal(usedFallback, true);
    assert.equal(card.location_label, "shoulder", "the label from the fixed map");
    assert.equal(card.duration, "two days", "the user's own duration expression");
    assert.equal(card.user_own_sentence, "A heavy band across my chest.", "the description, verbatim");
    assert.deepEqual(card.quality_words, FALLBACK_CARD.quality_words, "reviewed copy, not the draft's");
    assert.equal(card.intensity_metaphor, FALLBACK_CARD.intensity_metaphor);
    assert.equal(sensationCardSchema.safeParse(card).success, true);
  });

  it("AG-16 records the reason and the field names only, never content", async () => {
    const hostile = "You should rest and drink water.";
    const { records } = await cardFrom(draft({ intensity_metaphor: hostile, quality_words: ["hydrate"] }));

    const serialised = JSON.stringify(records);

    assert.equal(records.length, 1, "one record per refusal");
    assert.equal(serialised.includes(hostile), false, "no model text");
    assert.equal(serialised.includes(SESSION.answers[0].text), false, "no user text");
    assert.equal(serialised.includes("hydrate"), false, "no refused value");
    assert.equal(records[0].event, "model-output-rejected");
    assert.equal(records[0].reason, "prohibited-language");
    assert.deepEqual([...records[0].keys].sort(), ["intensity_metaphor", "quality_words"]);
    assert.deepEqual(records[0].questions, ["Q1", "Q4", "Q14"]);
    assert.equal(records[0].mode, "mock");
  });

  it("AG-17 catches every reviewed shape the lists claim to cover", async () => {
    const samples: string[] = [
      ...CAUSAL_PHRASES.map((phrase) => `Like ${phrase} the desk.`),
      ...CONDITION_NAME_SAMPLE.map((name) => `Like a classic ${name}.`),
      "You should rest.",
      "It might be worth a look.",
      "Ask your doctor.",
      "Take your medication.",
      "Make sure to drink water.",
      "Talk to your physician.",
    ];

    for (const sample of samples) {
      const { usedFallback, records } = await cardFrom(draft({ intensity_metaphor: sample }));

      assert.equal(usedFallback, true, `${JSON.stringify(sample)} must be refused`);
      assert.deepEqual(records[0].keys, ["intensity_metaphor"], JSON.stringify(sample));
    }
  });

  it("AG-18 finds nothing in the reviewed fallback's own copy", async () => {
    const { usedFallback, records } = await cardFrom(
      draft({
        quality_words: [...FALLBACK_CARD.quality_words],
        intensity_metaphor: FALLBACK_CARD.intensity_metaphor,
      }),
    );

    assert.equal(usedFallback, false, "the reviewed copy is clean, so a fallback never reintroduces it");
    assert.deepEqual(records, []);
  });

  it("AG-19 leaves every mock card alone, so mock mode cannot change", async () => {
    const sessions: FidelitySource[] = [
      { answers: [] },
      { answers: SESSION.answers, regionLabel: "shoulder" },
      { answers: SESSION.answers, description: "A heavy band across my chest." },
      { answers: NEGATED.answers, regionLabel: "chest" },
      {
        answers: [{ questionId: "Q12", text: "It has been there for about three days now." }],
        regionLabel: "head",
      },
    ];

    for (const session of sessions) {
      const { usedFallback, records } = await cardFrom(mockCardFrom(session), session);

      assert.equal(usedFallback, false, JSON.stringify(session));
      assert.deepEqual(records, [], JSON.stringify(session));
    }
  });

  it("AG-20 reads only the two fields a model may word", () => {
    // The guard's whole surface, asserted directly: three fields are the grounding's, two are the model's.
    const hostile = "You should rest and take medication.";

    assert.deepEqual(
      prohibitedLanguageIn(
        draft({ location_label: hostile, duration: hostile, user_own_sentence: hostile }),
        SESSION,
      ),
      [],
      "the grounding owns these three fields",
    );
    assert.deepEqual(prohibitedLanguageIn(draft({ quality_words: ["hydrate"] }), SESSION), ["quality_words"]);
    assert.deepEqual(
      prohibitedLanguageIn(draft({ intensity_metaphor: "You should rest." }), SESSION),
      ["intensity_metaphor"],
    );
  });
});