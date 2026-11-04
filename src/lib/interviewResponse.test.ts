import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { answerFor, UNAVAILABLE_ANSWER } from "./interviewResponse.ts";

/**
 * The route's answer mapping - blueprint Chapter 5.3 and Table 5, and Phase 2C's exception boundary.
 *
 * Executed rather than grepped: the mapping is a pure function of a turn's outcome, so the statuses and
 * bodies the route actually returns can be asserted here, including the one that must never be a crisis.
 */

const CARD = {
  location_label: "chest",
  quality_words: ["tight"],
  intensity_metaphor: "like a band",
  duration: "since this morning",
  user_own_sentence: "tight and heavy",
};

describe("the interview route's answer mapping", () => {
  it("maps each outcome to the status and body the client expects", () => {
    assert.deepEqual(answerFor({ status: "invalid", reason: "the request body is not an object" }), {
      status: 400,
      body: { error: "invalid request" },
    });

    assert.deepEqual(answerFor({ status: "asking", question: { id: "Q2", text: "where is it?" }, answers: [] }), {
      status: 200,
      body: {
        status: "asking",
        question: { id: "Q2", text: "where is it?" },
        // The guided turn's words travel with the question (`ISS-26`); a caller that offered none sends
        // an empty list rather than nothing, so the client has one shape to read.
        options: [],
        source: "fallback",
      },
    });

    assert.deepEqual(answerFor({ status: "complete", card: CARD, usedFallback: true, answers: [] }), {
      status: 200,
      body: { status: "complete", card: CARD, usedFallback: true },
    });

    assert.deepEqual(answerFor({ status: "crisis" }), { status: 200, body: { status: "crisis" } });
  });

  it("answers a turn that could not be produced with a neutral 503, never a crisis", () => {
    assert.equal(UNAVAILABLE_ANSWER.status, 503);
    assert.deepEqual(UNAVAILABLE_ANSWER.body, { error: "unavailable" });
    assert.notDeepEqual(UNAVAILABLE_ANSWER.body, { status: "crisis" });
  });

  it("leaks nothing in that answer: one key, no reason, no user text", () => {
    assert.deepEqual(Object.keys(UNAVAILABLE_ANSWER.body), ["error"]);
    assert.equal(typeof UNAVAILABLE_ANSWER.body.error, "string");
  });
});