import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fallbackGuide, guideChoicesFor, guideFromReply } from "./guide.ts";
import { interviewStep, type InterviewDeps } from "./interview.ts";
import { mockAdapter, type ModelAdapter } from "./models.ts";
import { questionById } from "./questionBank.ts";
import { vocabularyFor } from "./vocabulary.ts";

/**
 * The guided interview (`ISS-26`).
 *
 * The model's new job is to choose which reviewed question to ask next, and to offer a few words for it.
 * These tests hold that to the four properties the product promises: the question is a *choice* from the
 * reviewed bank rather than text the model wrote; the words are possibilities a person may borrow; a
 * reply that breaks any rule is replaced by the reviewed fallback rather than shown; and a client that
 * keeps no record of what it was asked gets exactly the behaviour it got before the guide existed.
 *
 * Nothing here reaches a network: the guide's own validation is exercised directly, and the interview is
 * driven with an injected adapter that stands in for the model.
 */

const DEPS: InterviewDeps = { adapter: mockAdapter, logger: () => {}, mode: "mock" };
const ACK = "local";

/** A turn as the screen sends it: the answers so far, the words, and the record of what was asked. */
function turn(body: Record<string, unknown>) {
  return interviewStep({ regionLabel: "shoulder", acknowledgedProvider: ACK, ...body }, DEPS);
}

/** An adapter whose guide returns whatever the test says, and whose card path is the mock's. */
function adapterWithGuide(reply: unknown | (() => Promise<never>)): ModelAdapter {
  return {
    ...mockAdapter,
    async guide() {
      if (typeof reply === "function") return reply();

      return reply;
    },
  };
}

function depsWith(reply: unknown | (() => Promise<never>)): InterviewDeps {
  return { ...DEPS, adapter: adapterWithGuide(reply) };
}

describe("the guided turn's reply", () => {
  it("takes the model's question when it is a reviewed question this session has not asked", () => {
    const guide = guideFromReply(
      {
        question_id: "Q12",
        options: [
          { word: "softer", meaning: "less strong than it was" },
          { word: "clearer", meaning: "easier to notice than before" },
        ],
      },
      ["Q1"],
      "Q4",
    );

    assert.equal(guide.questionId, "Q12");
    assert.equal(guide.source, "model");
    assert.deepEqual(guide.options, [
      { word: "softer", meaning: "less strong than it was" },
      { word: "clearer", meaning: "easier to notice than before" },
    ]);
    // The wording is the bank's, never the model's: `questionById` is the only source of a question.
    assert.equal(questionById(guide.questionId)?.id, "Q12");
  });

  it("falls back to the reviewed question for an id outside the bank, or one already asked", () => {
    for (const question_id of ["Q99", "Q1", "", "Q12; drop table"]) {
      const guide = guideFromReply({ question_id, options: [{ word: "tight", meaning: "pulled firm" }] }, ["Q1"], "Q4");

      assert.equal(guide.questionId, "Q4", question_id);
      assert.equal(guide.source, "fallback");
      assert.deepEqual(guide.options, vocabularyFor("Q4"));
    }
  });

  it("drops an option that is a sentence, a repeat, or carries prohibited language", () => {
    const guide = guideFromReply(
      {
        question_id: "Q4",
        options: [
          { word: "tight", meaning: "pulled firm, with no give in it" },
          { word: "tight", meaning: "the same word again" },
          { word: "you should rest it now", meaning: "guidance rather than a description" },
          { word: "smooth", meaning: "even and flat" },
        ],
      },
      [],
      "Q4",
    );

    assert.equal(guide.source, "model");
    assert.deepEqual(
      guide.options.map((option) => option.word),
      ["tight", "smooth"],
      "the repeat and the sentence are dropped, not repaired",
    );
  });

  it("falls back to the reviewed vocabulary when too few options survive", () => {
    const guide = guideFromReply(
      { question_id: "Q4", options: [{ word: "tight", meaning: "ok" }] },
      [],
      "Q4",
    );

    assert.equal(guide.source, "fallback");
    assert.deepEqual(guide.options, vocabularyFor("Q4"));
  });

  it("falls back whole when the reply is not the strict shape", () => {
    const replies = [
      null,
      "a sentence rather than an object",
      {},
      { question_id: "Q4" },
      { question_id: "Q4", options: [] },
      { question_id: "Q4", options: [{ word: "tight" }] },
      { question_id: "Q4", options: [{ word: "tight", meaning: "pulled firm", confidence: 0.9 }] },
      { question_id: "Q4", options: [{ word: "tight", meaning: "pulled firm" }], guidance: "rest it" },
      { question_id: "Q4", options: Array.from({ length: 9 }, (_unused, index) => ({ word: `w${index}`, meaning: "a word" })) },
    ];

    for (const reply of replies) {
      const guide = guideFromReply(reply, [], "Q4");

      assert.equal(guide.source, "fallback", JSON.stringify(reply));
      assert.equal(guide.questionId, "Q4");
    }
  });

  it("offers the whole reviewed bank minus what has been asked", () => {
    const choices = guideChoicesFor(["Q1", "Q4"]);

    assert.equal(choices.includes("Q1"), false);
    assert.equal(choices.includes("Q4"), false);
    assert.equal(choices.includes("Q12"), true);
    assert.equal(choices.length, 12);
  });

  it("always has a reviewed fallback for the question the sequence would have asked", () => {
    for (const id of ["Q1", "Q4", "Q14"]) {
      const guide = fallbackGuide(id);

      assert.equal(guide.questionId, id);
      assert.deepEqual(guide.options, vocabularyFor(id));
      assert.equal(guide.source, "fallback");
    }
  });
});

/**
 * The interview with a guide.
 *
 * This is the part the hackathon demonstration rests on: the question a person is asked next is the
 * model's choice, made from what they wrote, and the words offered with it are the model's. The adapter
 * here stands in for the provider, so the behaviour is proven without a network - and the *same*
 * machinery is what a live build drives.
 */
describe("the interview with a guide", () => {
  it("asks the question the model chose, and offers the words it wrote", async () => {
    const result = await interviewStep(
      {
        answers: [],
        text: null,
        regionLabel: "shoulder",
        description: "I feel something around my shoulder. It's tight. I don't know how to describe it.",
        acknowledgedProvider: ACK,
        asked: [],
      },
      depsWith({
        question_id: "Q3",
        options: [
          { word: "steady", meaning: "the same the whole time" },
          { word: "in waves", meaning: "it builds and eases, again and again" },
          { word: "wave-like", meaning: "building and easing, over and over" },
        ],
      }),
    );

    assert.equal(result.status, "asking");

    if (result.status !== "asking") return;

    // The model chose Q3, and the wording is the bank's.
    assert.equal(result.question.id, "Q3");
    assert.equal(result.question.text, questionById("Q3")?.text);
    assert.equal(result.source, "model");
    assert.deepEqual(
      (result.options ?? []).map((option) => option.word),
      ["steady", "in waves", "wave-like"],
    );
  });

  it("never asks a question the session has already asked", async () => {
    // The model answers with a question that was already asked: the reviewed fallback stands in, so the
    // same question cannot come round twice.
    const result = await interviewStep(
      {
        answers: [{ questionId: "Q1", text: "it stays in one spot" }],
        text: "tight",
        regionLabel: "shoulder",
        description: "",
        acknowledgedProvider: ACK,
        asked: ["Q1", "Q4"],
      },
      depsWith({ question_id: "Q1", options: [{ word: "tight", meaning: "pulled firm, with no give in it" }] }),
    );

    assert.equal(result.status, "asking");

    if (result.status !== "asking") return;

    assert.equal(result.question.id, "Q14", "the reviewed sequence's next question");
    assert.equal(result.source, "fallback");
    assert.deepEqual(result.options, vocabularyFor("Q14"));
  });

  it("falls back to the reviewed sequence when the guide fails", async () => {
    const result = await interviewStep(
      { answers: [], text: null, regionLabel: "shoulder", description: "something", acknowledgedProvider: ACK, asked: [] },
      depsWith(async () => {
        throw new Error("provider down");
      }),
    );

    assert.equal(result.status, "asking");

    if (result.status !== "asking") return;

    assert.equal(result.question.id, "Q1");
    assert.equal(result.source, "fallback");
    assert.deepEqual(result.options, vocabularyFor("Q1"));
  });

  it("keeps the reviewed sequence when the client sends no record of what was asked", async () => {
    const result = await turn({ answers: [], text: null, description: "" });

    assert.equal(result.status, "asking");

    if (result.status !== "asking") return;

    assert.equal(result.question.id, "Q1", "the reviewed sequence, exactly as before ISS-26");
    assert.equal(result.source, "fallback");
  });
});
