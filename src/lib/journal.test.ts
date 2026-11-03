import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cardPayloadFromRecord,
  isJournalCardRecord,
  journalEntryFromRecord,
  savedCardFromPayload,
  type JournalCardRecord,
} from "./journal.ts";
import { FALLBACK_CARD, sensationCardSchema } from "./schema.ts";

/**
 * The journal's pure half - what a card is stored as, and what a stored row is read back as.
 *
 * Two properties are the whole point, and both are about the user's own words and nothing else:
 *   - nothing the user did not say is ever stored, so a field the renderer presents as unanswered is
 *     stored empty rather than as the reviewed fallback's placeholder text, and a fallback card's
 *     model-worded fields are dropped;
 *   - nothing that is not a five-field card is stored or shown, so the strict schema is the door on
 *     both sides.
 */

const CARD = {
  location_label: "Upper arm",
  quality_words: ["tiny", "buzzing"],
  intensity_metaphor: "like tiny bubbles",
  duration: "",
  user_own_sentence: "A fictional character describes a small, steady buzzing in the upper arm.",
};

const RECORD: JournalCardRecord = {
  id: "3f6c1a58-9a4e-4a4f-8a1f-2b0f9c7d5e11",
  created_at: "2026-11-02T10:00:00.000Z",
  ...CARD,
};

describe("what a completed card is stored as (journal)", () => {
  it("keeps the user's own values exactly as they are", () => {
    assert.deepEqual(savedCardFromPayload(CARD), CARD);
  });

  it("refuses anything that is not a five-field card, rather than repairing it", () => {
    assert.equal(savedCardFromPayload({ ...CARD, possible_cause: "a long day at the desk" }), null);
    assert.equal(savedCardFromPayload({ ...CARD, quality_words: ["a", "b", "c", "d", "e", "f"] }), null);
    assert.equal(savedCardFromPayload({ ...CARD, duration: 7 }), null);
    assert.equal(savedCardFromPayload({ ...CARD, quality_words: "tiny" }), null);
    assert.equal(savedCardFromPayload(null), null);
    assert.equal(savedCardFromPayload("a card"), null);
    assert.equal(savedCardFromPayload([CARD]), null);
  });

  it("stores the reviewed fallback's placeholders as empty, never as the user's words", () => {
    const saved = savedCardFromPayload(FALLBACK_CARD);

    assert.notEqual(saved, null);

    if (saved === null) return;

    assert.equal(saved.location_label, "");
    assert.equal(saved.duration, "");
    assert.equal(saved.user_own_sentence, "");
  });

  it("drops the two fields a model words when the card was the fallback", () => {
    const saved = savedCardFromPayload({
      ...FALLBACK_CARD,
      location_label: "Upper arm",
      user_own_sentence: "A fictional character describes a small, steady buzzing in the upper arm.",
    });

    assert.notEqual(saved, null);

    if (saved === null) return;

    // The fallback's own reviewed copy is not the user's vocabulary, so it is not kept.
    assert.deepEqual(saved.quality_words, []);
    assert.equal(saved.intensity_metaphor, "");
    // What the session itself supplied survives.
    assert.equal(saved.location_label, "Upper arm");
    assert.equal(saved.user_own_sentence, "A fictional character describes a small, steady buzzing in the upper arm.");
  });

  it("keeps a model-worded field on a card that passed validation", () => {
    const saved = savedCardFromPayload(CARD);

    assert.notEqual(saved, null);

    if (saved === null) return;

    assert.deepEqual(saved.quality_words, ["tiny", "buzzing"]);
    assert.equal(saved.intensity_metaphor, "like tiny bubbles");
  });

  it("keeps a person's own word that happens to be one the fallback uses", () => {
    const saved = savedCardFromPayload({
      ...CARD,
      quality_words: ["present", "buzzing"],
      intensity_metaphor: "like a window opening",
    });

    assert.notEqual(saved, null);

    if (saved === null) return;

    // Only the fallback's *pair*, untouched, is treated as the product's own words.
    assert.deepEqual(saved.quality_words, ["present", "buzzing"]);
    assert.equal(saved.intensity_metaphor, "like a window opening");
  });
});

describe("reading a stored row back (journal)", () => {
  it("accepts a row this build can render, and refuses anything else", () => {
    assert.equal(isJournalCardRecord(RECORD), true);
    assert.equal(isJournalCardRecord({ ...RECORD, quality_words: ["tiny", 7] }), false);
    assert.equal(isJournalCardRecord({ ...RECORD, id: "" }), false);
    assert.equal(isJournalCardRecord({ ...RECORD, created_at: undefined }), false);
    assert.equal(isJournalCardRecord({ ...RECORD, duration: null }), false);
    assert.equal(isJournalCardRecord(null), false);
    assert.equal(isJournalCardRecord([RECORD]), false);
  });

  it("hands the five fields to the renderer unchanged and still schema-valid", () => {
    const payload = cardPayloadFromRecord(RECORD);

    assert.deepEqual(payload, CARD);
    assert.equal(sensationCardSchema.safeParse(payload).success, true);
  });

  it("maps a row to a journal entry without deriving anything", () => {
    assert.deepEqual(journalEntryFromRecord(RECORD), {
      date: "2026-11-02",
      region: "Upper arm",
      qualityWords: ["tiny", "buzzing"],
      ownSentence: "A fictional character describes a small, steady buzzing in the upper arm.",
    });
  });
});
