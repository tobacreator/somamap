import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QUESTION_BANK, questionById, questionIds } from "./questionBank.ts";

/**
 * The question bank's own tests - blueprint Table 11 and iron rule 2.
 *
 * The exact-wording audit against Table 11 lives in the red-team pack (T6), which keeps
 * its own copy of the approved list. These tests cover the bank's shape, so a broken
 * entry is caught fast even before the pack runs.
 */

/** The provocation verbs Table 7 forbids, matched on word boundaries. */
const PROVOCATION_VERB_PATTERN = /\b(breathe|breathes|breathing|move|moves|moving|eat|eats|eating|radiate|radiates|radiating)\b/i;

describe("question bank", () => {
  it("numbers its questions sequentially from Q1", () => {
    assert.deepEqual(
      questionIds(),
      QUESTION_BANK.map((_question, index) => `Q${index + 1}`),
    );
  });

  it("gives every question a text and a texture column", () => {
    for (const question of QUESTION_BANK) {
      assert.ok(question.text.trim().length > 0, `${question.id} has no text`);
      assert.ok(question.text.trim().endsWith("?"), `${question.id} does not ask a question`);
      assert.ok(question.texture.trim().length > 0, `${question.id} has no texture column`);
    }
  });

  it("asks every question once, in its own words", () => {
    const texts = QUESTION_BANK.map((question) => question.text);
    const textures = QUESTION_BANK.map((question) => question.texture);

    assert.equal(new Set(texts).size, texts.length);
    assert.equal(new Set(textures).size, textures.length);
    assert.equal(new Set(questionIds()).size, QUESTION_BANK.length);
  });

  it("carries no provocation verb", () => {
    const offending = QUESTION_BANK.filter((question) => PROVOCATION_VERB_PATTERN.test(question.text)).map(
      (question) => question.id,
    );

    assert.deepEqual(offending, []);
  });

  it("looks a question up by its id, and returns null for anything else", () => {
    assert.equal(questionById("Q1")?.text, QUESTION_BANK[0].text);
    assert.equal(questionById("Q99"), null);
    assert.equal(questionById(""), null);
  });
});
