import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groundModelDraft, isComparisonShaped, mockCardFrom, type FidelitySource } from "./cardFidelity.ts";
import { cardViewForPayload, displayRows } from "./cardView.ts";
import { CARD_NOT_ANSWERED } from "./copy.ts";
import { mockAdapter, wordCard, type ModelAdapter, type ViolationRecord } from "./models.ts";
import { sensationCardSchema, type SensationCard } from "./schema.ts";

/**
 * Phase 2A - the model's draft, grounded in the session.
 *
 * The defect these cases exist for: `wordCard` accepted a valid model draft almost verbatim, so a
 * provider could put a region the user never tapped, a duration they never gave and a sentence they
 * never wrote on the card - and the strict schema could not tell, because the draft carried the five
 * approved keys. Every case below drives the **real boundary** (`wordCard`) with a draft that is
 * deliberately *valid*, so what is proven is the grounding rather than the schema's refusal:
 * `usedFallback` is false throughout.
 *
 * What a model is still allowed to do is asserted too, so the protection is not mistaken for a ban:
 * it may select and order words the user actually typed, and it may select a comparison the user
 * actually made.
 *
 * Nothing here adds a field, a question, or any statement about what a sensation means.
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

/** The description the user wrote on the check-in screen, before any question was asked. */
const DESCRIPTION = "A heavy band across my chest that I have noticed since this morning.";

/**
 * A valid draft that invents something in every field the session owns: a region the user did not
 * tap, two words they did not type, a simile they did not make, a duration they did not give and an
 * embellished version of their sentence.
 */
const INVENTED: SensationCard = {
  location_label: "head",
  quality_words: ["throbbing", "radiating", "tight"],
  intensity_metaphor: "like a stone in a stream",
  duration: "for six months",
  user_own_sentence: "A scarf knotted too tight across my shoulders.",
};

type Worded = { card: SensationCard; usedFallback: boolean; records: ViolationRecord[] };

/** The boundary, exactly as the route drives it: the draft arrives as a provider would shape it. */
async function cardFrom(draft: SensationCard, session: FidelitySource): Promise<Worded> {
  const records: ViolationRecord[] = [];
  const adapter: ModelAdapter = { ...mockAdapter, interview: async () => draft };
  const worded = await wordCard(session, { adapter, logger: (record) => records.push(record), mode: "mock" });

  return { card: worded.card, usedFallback: worded.usedFallback, records };
}

/** The rendered row for one field, as the card screen shows it. */
function rowFor(card: unknown, field: string) {
  return cardViewForPayload(card).rows.find((row) => row.field === field);
}

/** A session with no region selected at all. */
function withoutRegion(session: FidelitySource): FidelitySource {
  return { answers: session.answers, description: session.description };
}

describe("the region comes from the fixed map, never from the draft", () => {
  it("discards a region the model drafted when the user selected none", async () => {
    const { card, usedFallback, records } = await cardFrom(INVENTED, withoutRegion(SESSION));

    assert.equal(usedFallback, false, "the draft is valid, so the grounding is what discards the label");
    assert.deepEqual(records, []);
    assert.notEqual(card.location_label, INVENTED.location_label, "the model's region is not the user's");
    assert.equal(card.location_label, "", "no region was selected, so none is named");
    assert.equal(rowFor(card, "location_label")?.answered, false);
    assert.equal(rowFor(card, "location_label")?.display, CARD_NOT_ANSWERED);
  });

  it("keeps the region the user selected, whatever the model drafted", async () => {
    const different = await cardFrom(INVENTED, SESSION);

    assert.equal(different.card.location_label, "shoulder", "the selected region wins over the draft's");

    // A label the fixed map does not know cannot win either: it is no region at all.
    const inventedLabel = await cardFrom({ ...INVENTED, location_label: "elbow" }, SESSION);

    assert.equal(inventedLabel.card.location_label, "shoulder");
  });
});

describe("duration comes from the session's answers, never from the draft", () => {
  it("discards a duration the model drafted", async () => {
    // This session said nothing about how long, so there is no duration to show.
    const { card, usedFallback } = await cardFrom(INVENTED, SESSION);

    assert.equal(usedFallback, false);
    assert.notEqual(card.duration, INVENTED.duration, "the model's duration is not the user's");
    assert.equal(card.duration, "");
  });

  it("keeps the user's own duration expression, and not the sentence around it", async () => {
    /**
     * The description carries a time expression and so does the first answer. Only the answer's own
     * phrase may reach the row: the description is the user's sentence, not their answer to "how
     * long", and a duration read from it would be the surrounding sentence rather than the
     * expression the user supplied.
     */
    const session: FidelitySource = {
      answers: [
        { questionId: "Q1", text: "For two days." },
        { questionId: "Q4", text: "Like a scarf knotted too tight." },
        { questionId: "Q14", text: "It stays in one spot." },
      ],
      regionLabel: "shoulder",
      description: DESCRIPTION,
    };

    const { card, usedFallback } = await cardFrom(INVENTED, session);

    assert.equal(usedFallback, false);
    assert.equal(card.duration, "two days", "the user's own duration expression, quoted exactly");
    assert.notEqual(card.duration, INVENTED.duration, "not the model's");
    assert.notEqual(card.duration, DESCRIPTION, "not the surrounding sentence");
    assert.notEqual(card.duration, session.answers[1].text);
  });

  it("leaves duration empty, and hides the row, when the session gave none", async () => {
    const { card } = await cardFrom(INVENTED, SESSION);
    const rendered = displayRows(cardViewForPayload(card));

    assert.equal(card.duration, "");
    assert.equal(rendered.some((row) => row.field === "duration"), false, "an unanswered row is hidden");
    assert.equal(rendered.length, 4, "the other four rows still render");
  });
});

describe("the sentence is the user's own, never the draft's", () => {
  it("keeps the description the user wrote, verbatim, whatever the model drafted", async () => {
    const { card, usedFallback } = await cardFrom(INVENTED, { ...SESSION, description: DESCRIPTION });

    assert.equal(usedFallback, false);
    assert.equal(card.user_own_sentence, DESCRIPTION, "the user's own first account, copied whole");
    assert.notEqual(card.user_own_sentence, INVENTED.user_own_sentence, "not the model's sentence");
  });

  it("falls back to the approved answer selection when the user wrote no description", async () => {
    const { card, usedFallback } = await cardFrom(INVENTED, SESSION);

    assert.equal(usedFallback, false);
    assert.notEqual(card.user_own_sentence, INVENTED.user_own_sentence);
    assert.equal(card.user_own_sentence, "Tight and heavy across my shoulders.");
    assert.equal(
      card.user_own_sentence,
      mockCardFrom(SESSION).user_own_sentence,
      "the same approved selection the session's own card uses",
    );
  });
});

describe("quality words are grounded in the user's own vocabulary", () => {
  it("keeps only the words the user actually typed, in the model's order", async () => {
    const { card, usedFallback } = await cardFrom(INVENTED, SESSION);

    assert.equal(usedFallback, false);
    assert.deepEqual(card.quality_words, ["tight"], "the typed word is kept; the invented two are not");

    for (const invented of ["throbbing", "radiating"]) {
      assert.equal(card.quality_words.includes(invented), false, `${invented} was never typed`);
    }
  });

  it("treats a word the user typed in the description as the user's own word", async () => {
    const { card } = await cardFrom(
      { ...INVENTED, quality_words: ["noticed", "throbbing"] },
      { ...SESSION, description: DESCRIPTION },
    );

    assert.deepEqual(card.quality_words, ["noticed"]);
  });

  it("never empties the row into a model's vocabulary when nothing it supplied is the user's", async () => {
    const { card } = await cardFrom({ ...INVENTED, quality_words: ["throbbing", "radiating"] }, SESSION);

    assert.deepEqual(card.quality_words, mockCardFrom(SESSION).quality_words, "the session's own words stand in");
    assert.ok(card.quality_words.length > 0, "a bad selection does not empty the row");
    assert.ok(card.quality_words.length <= 5, "the schema's cap still holds");

    for (const invented of ["throbbing", "radiating"]) {
      assert.equal(card.quality_words.includes(invented), false);
    }
  });
});

describe("a comparison must be the user's own, verbatim and comparison-shaped", () => {
  it("discards a simile the user never made, and keeps the session's own comparison", async () => {
    const { card, usedFallback } = await cardFrom(INVENTED, SESSION);

    assert.equal(usedFallback, false);
    assert.notEqual(card.intensity_metaphor, INVENTED.intensity_metaphor, "the model's simile is not the user's");
    assert.equal(card.intensity_metaphor, "Like a scarf knotted too tight.", "the user's own comparison stands in");
  });

  it("accepts the user's own comparison, quoted exactly", async () => {
    const { card } = await cardFrom({ ...INVENTED, intensity_metaphor: "Like a scarf knotted too tight." }, SESSION);

    assert.equal(card.intensity_metaphor, "Like a scarf knotted too tight.");
  });

  it("refuses a verbatim user answer that is not comparison-shaped", async () => {
    const { card } = await cardFrom({ ...INVENTED, intensity_metaphor: "It stays in one spot." }, SESSION);

    assert.notEqual(card.intensity_metaphor, "It stays in one spot.", "being the user's words is not enough");
    assert.equal(card.intensity_metaphor, "Like a scarf knotted too tight.");
  });

  it("refuses a comparison the user wrote only in the description", async () => {
    /**
     * The description always takes the sentence row when the user wrote one (`ISS-16/B`), so a
     * comparison taken from it would be shown twice on the same card. The comparison is read from
     * the answers alone, and a model may not introduce the source the card's own rules exclude.
     */
    const session: FidelitySource = {
      answers: [{ questionId: "Q1", text: "Tight and heavy across my shoulders." }],
      regionLabel: "shoulder",
      description: "It feels like a warm bath.",
    };
    const { card } = await cardFrom({ ...INVENTED, intensity_metaphor: "It feels like a warm bath." }, session);

    assert.notEqual(card.intensity_metaphor, "It feels like a warm bath.");
    assert.equal(card.intensity_metaphor, "", "the session made no comparison in its answers");
    assert.equal(card.user_own_sentence, "It feels like a warm bath.", "the description keeps the sentence row");
  });

  it("leaves the row either empty or holding a verbatim comparison-shaped phrase the user gave", async () => {
    const candidates = [
      "like a stone in a stream",
      "It stays in one spot.",
      "Like a scarf knotted too tight.",
      "",
      "a stone in a stream",
    ];

    for (const candidate of candidates) {
      const { card } = await cardFrom({ ...INVENTED, intensity_metaphor: candidate }, SESSION);
      const row = card.intensity_metaphor;

      if (row.length === 0) continue;

      assert.equal(
        SESSION.answers.some((answer) => answer.text.includes(row)),
        true,
        `${JSON.stringify(row)} must be the user's own words`,
      );
      assert.equal(isComparisonShaped(row), true, `${JSON.stringify(row)} must be comparison-shaped`);
    }
  });
});

describe("the grounded card is still a card", () => {
  it("passes the strict five-field schema, and keeps the row cap", async () => {
    const { card } = await cardFrom(INVENTED, SESSION);

    assert.equal(sensationCardSchema.safeParse(card).success, true);
    assert.deepEqual(Object.keys(card).sort(), [
      "duration",
      "intensity_metaphor",
      "location_label",
      "quality_words",
      "user_own_sentence",
    ]);
    assert.ok(card.quality_words.length <= 5);
  });
});

describe("mock mode is already grounded, so the grounding cannot move it", () => {
  const SESSIONS: FidelitySource[] = [
    { answers: [] },
    { answers: SESSION.answers, regionLabel: "shoulder" },
    { answers: SESSION.answers, description: DESCRIPTION },
    { answers: [{ questionId: "Q1", text: "For two days." }], regionLabel: "head" },
    { answers: [{ questionId: "Q12", text: "It has been there for about three days now." }], regionLabel: "chest" },
    { answers: [{ questionId: "Q1", text: "It stays in one spot." }], regionLabel: "knees" },
  ];

  it("returns the mock's own card unchanged, for every session shape", () => {
    for (const session of SESSIONS) {
      assert.deepEqual(
        groundModelDraft(mockCardFrom(session), session),
        mockCardFrom(session),
        `the mock's card must survive the grounding: ${JSON.stringify(session)}`,
      );
    }
  });
});
