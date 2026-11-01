import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QUESTION_BANK } from "../../src/lib/questionBank.ts";
import { APPROVED_TABLE_11, OWNER_APPROVED_ADDITIONS, diffQuestionBank } from "./t6-bank-audit.ts";

/**
 * Mutation tests for the T6 audit.
 *
 * T6's job is to catch a bank that drifts from Table 11, so the audit itself has to be
 * shown to fail when the bank is altered: a reworded question, an inserted question, a
 * removed question, a reordering and a changed texture column must each be reported.
 *
 * The standard the audit diffs against is Table 11 **plus** the owner-approved additions
 * (`ISS-02`, 2026-11-01), transcribed independently in `t6-bank-audit.ts`. Anything else - any
 * extra question, any rewording, any removal - is still reported.
 */

/** The standard: Table 11's rows, then the recorded owner-approved additions. */
const APPROVED_STANDARD = [...APPROVED_TABLE_11, ...OWNER_APPROVED_ADDITIONS];

describe("T6 bank audit", () => {
  it("passes the bank that ships", () => {
    assert.deepEqual(diffQuestionBank(QUESTION_BANK, APPROVED_STANDARD), []);
  });

  it("reports a reworded question", () => {
    const altered = QUESTION_BANK.map((question) =>
      question.id === "Q3" ? { ...question, text: "Is it steady, or does it move around?" } : question,
    );

    assert.ok(diffQuestionBank(altered, APPROVED_STANDARD).some((line) => line.includes("wording changed for Q3")));
  });

  it("reports an inserted question", () => {
    const inserted = [...QUESTION_BANK, { id: "Q15", text: "Does it hurt more in the morning?", texture: "Timing" }];
    const problems = diffQuestionBank(inserted, APPROVED_STANDARD);

    assert.ok(problems.some((line) => line.includes("count")));
    assert.ok(problems.some((line) => line.includes("unapproved question inserted: Q15")));
  });

  it("reports a removed question", () => {
    const removed = QUESTION_BANK.filter((question) => question.id !== "Q13");
    const problems = diffQuestionBank(removed, APPROVED_STANDARD);

    assert.ok(problems.some((line) => line.includes("count")));
    assert.ok(problems.some((line) => line.includes("position 13")), problems.join("; "));
  });

  it("reports the removal of the owner-approved addition", () => {
    const removed = QUESTION_BANK.filter((question) => question.id !== "Q14");
    const problems = diffQuestionBank(removed, APPROVED_STANDARD);

    assert.ok(problems.some((line) => line.includes("count")));
    assert.ok(problems.some((line) => line.includes("missing question at position 14: Q14")), problems.join("; "));
  });

  it("reports a reordering", () => {
    const swapped = [...QUESTION_BANK];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];

    assert.ok(diffQuestionBank(swapped, APPROVED_STANDARD).some((line) => line.includes("position 1")));
  });

  it("reports a changed texture column", () => {
    const altered = QUESTION_BANK.map((question) =>
      question.id === "Q7" ? { ...question, texture: "Size" } : question,
    );

    assert.ok(diffQuestionBank(altered, APPROVED_STANDARD).some((line) => line.includes("texture column changed for Q7")));
  });

  it("holds the approved list independently of the bank", () => {
    assert.notEqual(APPROVED_TABLE_11, QUESTION_BANK);
    assert.notEqual(OWNER_APPROVED_ADDITIONS, QUESTION_BANK);
    assert.equal(APPROVED_STANDARD.length, QUESTION_BANK.length);
    assert.equal(APPROVED_TABLE_11.length, 13);
    assert.equal(OWNER_APPROVED_ADDITIONS.length, 1);
  });
});
