import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interviewFixture } from "./fixtures.ts";
import {
  EMPTY_INTERVIEW_STATE,
  QUESTIONS_PER_SESSION,
  afterResponse,
  answerRequest,
  answersWith,
  asInFlight,
  currentQuestion,
  firstRequest,
  parseResponse,
  progressFor,
  type InterviewFlowState,
} from "./interviewFlow.ts";
import { interviewStep, questionForStep, type InterviewDeps } from "./interview.ts";
import { mockAdapter } from "./models.ts";
import { questionById } from "./questionBank.ts";

/**
 * The client half of the interview under test - blueprint Chapter 5.3 and Table 10 stage 2.
 *
 * Two kinds of test are here. The first pins the module's own behaviour: the request bodies it
 * builds and the closed set of states it can reach. The second is the one that matters most -
 * it drives the **real** state machine (`interviewStep`) with the **real** mock adapter and the
 * exact bodies this module produces, so the client cannot drift from the server's contract
 * without a test failing. The route's own mapping from that result to a response body is
 * reproduced in `routeAnswer`, taken from src/app/api/interview/route.ts.
 */

/** Table 7's own crisis input. */
const CRISIS = "I want to hurt myself";

const ORDINARY = ["tight and heavy", "like a scarf knotted too tight", "since this morning"];

function deps(): InterviewDeps {
  return { adapter: mockAdapter, logger: () => {}, mode: "mock" };
}

/** The route's mapping from the state machine's result to the response body it sends. */
function routeAnswer(body: unknown): unknown {
  const result = interviewStep(body, deps());

  if (result.status === "asking") return { status: result.status, question: result.question };
  if (result.status === "complete") {
    return { status: result.status, card: result.card, usedFallback: result.usedFallback };
  }

  return { status: "crisis" };
}

describe("the request bodies the client builds", () => {
  it("asks the first question with the empty answer list, no text, and the region the user selected", () => {
    assert.deepEqual(firstRequest("shoulder"), { answers: [], regionLabel: "shoulder" });
    // No region selected travels as an empty label: the client never guesses one.
    assert.deepEqual(firstRequest(""), { answers: [], regionLabel: "" });
  });

  it("sends the answers already given plus the new words as text, and the region again", () => {
    const state: InterviewFlowState = {
      phase: "asking",
      question: { id: "Q4", text: "the bank's wording" },
      answers: [{ questionId: "Q1", text: ORDINARY[0] }],
    };

    assert.deepEqual(answerRequest(state, ORDINARY[1], "shoulder"), {
      answers: [{ questionId: "Q1", text: ORDINARY[0] }],
      text: ORDINARY[1],
      regionLabel: "shoulder",
    });
  });

  it("records the answer against the question that was on screen", () => {
    const state: InterviewFlowState = {
      phase: "asking",
      question: { id: "Q4", text: "the bank's wording" },
      answers: [{ questionId: "Q1", text: ORDINARY[0] }],
    };

    assert.deepEqual(answersWith(state, ORDINARY[1]), [
      { questionId: "Q1", text: ORDINARY[0] },
      { questionId: "Q4", text: ORDINARY[1] },
    ]);
  });

  it("builds nothing when no question is on screen", () => {
    assert.equal(answerRequest(EMPTY_INTERVIEW_STATE, "words", ""), null);
    assert.equal(answerRequest({ phase: "crisis" }, "words", ""), null);
    assert.deepEqual(answersWith({ phase: "complete", card: {}, usedFallback: false }, "words"), []);
    assert.equal(currentQuestion(EMPTY_INTERVIEW_STATE), null);
  });

  it("marks a state as waiting on the route", () => {
    const asking: InterviewFlowState = {
      phase: "asking",
      question: { id: "Q1", text: "the bank's wording" },
      answers: [],
    };

    assert.equal(asInFlight(asking).phase, "submitting");
    assert.equal(asInFlight(EMPTY_INTERVIEW_STATE).phase, "loading");
    assert.equal(asInFlight({ phase: "crisis" }).phase, "loading");
  });

  it("counts the question on screen, one-based, and stops at the last question", () => {
    const at = (given: number): InterviewFlowState => ({
      phase: "asking",
      question: { id: "Q1", text: "the bank's wording" },
      answers: Array.from({ length: given }, (_unused, index) => ({ questionId: `Q${index + 1}`, text: "x" })),
    });

    assert.deepEqual(progressFor(at(0)), { step: 1, total: QUESTIONS_PER_SESSION });
    assert.deepEqual(progressFor(at(1)), { step: 2, total: QUESTIONS_PER_SESSION });
    assert.deepEqual(progressFor(at(2)), { step: 3, total: QUESTIONS_PER_SESSION });
  });

  it("keeps the number on the question still on screen while an answer is in flight", () => {
    // The in-flight state carries the answer just given, so the question on screen is the one that
    // answer belongs to: the meter must not move on before the next question arrives.
    const inFlight = (answered: number): InterviewFlowState => ({
      phase: "submitting",
      question: { id: `Q${answered}`, text: "the bank's wording" },
      answers: Array.from({ length: answered }, (_unused, index) => ({ questionId: `Q${index + 1}`, text: "x" })),
    });

    assert.deepEqual(progressFor(inFlight(1)), { step: 1, total: QUESTIONS_PER_SESSION });
    assert.deepEqual(progressFor(inFlight(2)), { step: 2, total: QUESTIONS_PER_SESSION });
    assert.deepEqual(progressFor(inFlight(3)), { step: 3, total: QUESTIONS_PER_SESSION });
  });

  it("shows the last question when the session is complete, and no number when there is no question", () => {
    assert.deepEqual(progressFor({ phase: "complete", card: {}, usedFallback: false }), {
      step: QUESTIONS_PER_SESSION,
      total: QUESTIONS_PER_SESSION,
    });

    assert.equal(progressFor(EMPTY_INTERVIEW_STATE), null);
    assert.equal(progressFor({ phase: "crisis" }), null);
    assert.equal(progressFor({ phase: "failed", detail: "the route answered 500" }), null);
  });
});

describe("reading the route's answer", () => {
  it("accepts an asking answer and keeps the bank's wording", () => {
    const parsed = parseResponse({ status: "asking", question: { id: "Q1", text: "Does it stay in one spot?" } });

    assert.equal(parsed.status, "asking");
    assert.deepEqual(parsed.status === "asking" ? parsed.question : null, {
      id: "Q1",
      text: "Does it stay in one spot?",
    });
  });

  it("accepts a complete answer and passes the card through untouched", () => {
    const parsed = parseResponse({
      status: "complete",
      card: interviewFixture.draft_card,
      usedFallback: false,
    });

    assert.equal(parsed.status, "complete");
    assert.deepEqual(parsed.status === "complete" ? parsed.card : null, interviewFixture.draft_card);
    assert.equal(parsed.status === "complete" ? parsed.usedFallback : null, false);
  });

  it("accepts the crisis answer", () => {
    assert.equal(parseResponse({ status: "crisis" }).status, "crisis");
  });

  it("fails closed on anything it does not recognise", () => {
    const unreadable: unknown[] = [
      null,
      undefined,
      "asking",
      42,
      [],
      {},
      { status: "finished" },
      { status: "asking" },
      { status: "asking", question: { id: "Q1" } },
      { status: "asking", question: { text: "wording" } },
      { status: "asking", question: { id: "", text: "wording" } },
      { status: "asking", question: "Q1" },
      { status: "complete" },
      { status: "complete", card: null },
      { error: "invalid request" },
    ];

    for (const payload of unreadable) {
      const parsed = parseResponse(payload);

      assert.equal(parsed.status, "unexpected", `payload ${JSON.stringify(payload) ?? "undefined"}`);
    }
  });

  it("treats a missing usedFallback flag as false rather than failing the card", () => {
    const parsed = parseResponse({ status: "complete", card: interviewFixture.draft_card });

    assert.equal(parsed.status === "complete" ? parsed.usedFallback : null, false);
  });
});

describe("advancing the flow", () => {
  it("carries the answers already given into the next question", () => {
    const before: InterviewFlowState = {
      phase: "asking",
      question: { id: "Q1", text: "the bank's wording" },
      answers: [],
    };
    const after = afterResponse(before, {
      status: "asking",
      question: { id: "Q4", text: "the next wording" },
    });

    assert.equal(after.phase, "asking");
    assert.deepEqual(after.phase === "asking" ? after.question : null, { id: "Q4", text: "the next wording" });
    assert.deepEqual(after.phase === "asking" ? after.answers : null, []);
  });

  it("reaches complete only through a complete answer", () => {
    const card = interviewFixture.draft_card;
    const complete = afterResponse({ phase: "loading", answers: [] }, { status: "complete", card, usedFallback: true });

    assert.equal(complete.phase, "complete");
    assert.equal(complete.phase === "complete" ? complete.usedFallback : null, true);

    const asking = afterResponse({ phase: "loading", answers: [] }, {
      status: "asking",
      question: { id: "Q1", text: "wording" },
    });

    assert.equal(asking.phase, "asking");
    assert.equal("card" in asking, false);
  });

  it("reaches crisis, and a failed state for anything unexpected", () => {
    assert.equal(afterResponse({ phase: "loading", answers: [] }, { status: "crisis" }).phase, "crisis");

    const failed = afterResponse({ phase: "loading", answers: [] }, { status: "finished" });

    assert.equal(failed.phase, "failed");
    assert.equal(failed.phase === "failed" ? failed.detail.length > 0 : false, true);
  });
});

describe("the client's requests against the real state machine", () => {
  /** The region the map handed the flow in these tests. */
  const REGION = "shoulder";

  /** One turn: the request built from the state, the route's answer, and the state that follows. */
  function turn(state: InterviewFlowState, text: string): InterviewFlowState {
    const request = answerRequest(state, text, REGION);
    const question = currentQuestion(state);

    if (request === null || question === null) {
      throw new Error("the interview must have a question on screen before an answer is sent");
    }

    // The contract proof: the state machine itself must accept the body the client built.
    assert.notEqual(interviewStep(request, deps()).status, "invalid");

    return afterResponse({ phase: "asking", question, answers: answersWith(state, text) }, routeAnswer(request));
  }

  it("walks the three approved questions and completes with a card built from the answers", () => {
    let state = afterResponse(EMPTY_INTERVIEW_STATE, routeAnswer(firstRequest(REGION)));

    assert.equal(state.phase, "asking");
    assert.equal(state.phase === "asking" ? state.question.id : "", interviewFixture.question_ids[0]);
    assert.equal(
      state.phase === "asking" ? state.question.text : "",
      questionById(interviewFixture.question_ids[0])?.text,
    );

    for (const [index, text] of ORDINARY.entries()) {
      state = turn(state, text);

      const expected = index === ORDINARY.length - 1 ? "complete" : "asking";

      assert.equal(state.phase, expected, `turn ${index + 1} reached ${state.phase}`);

      if (state.phase === "asking") {
        const nextId = interviewFixture.question_ids[index + 1];

        assert.equal(state.question.id, nextId);
        assert.equal(state.question.text, questionById(nextId)?.text);
      }
    }

    assert.equal(state.phase, "complete");

    const card = state.phase === "complete" ? state.card : null;

    // The card carries the user's own material - the region they selected and the words they typed -
    // rather than the recorded draft it used to replay (Entry 42).
    assert.equal(card !== null && typeof card === "object" ? (card as { location_label: string }).location_label : "", REGION);
    assert.equal(
      card !== null && typeof card === "object" ? (card as { user_own_sentence: string }).user_own_sentence : "",
      ORDINARY[1],
    );
    assert.notDeepEqual(card, interviewFixture.draft_card);
    assert.equal(state.phase === "complete" ? state.usedFallback : null, false);
  });

  it("stops at the crisis answer, with no card in the state at all", () => {
    const state = afterResponse(EMPTY_INTERVIEW_STATE, routeAnswer(firstRequest(REGION)));

    assert.equal(state.phase, "asking");

    const stopped = turn(state, CRISIS);

    assert.equal(stopped.phase, "crisis");
    assert.equal("card" in stopped, false);
    assert.equal(stopped.phase === "crisis" ? Object.keys(stopped).length : 0, 1);
  });

  it("asks exactly the number of questions the session promises", () => {
    assert.equal(interviewFixture.question_ids.length, QUESTIONS_PER_SESSION);
    assert.equal(questionForStep(QUESTIONS_PER_SESSION - 1, mockAdapter).id, interviewFixture.question_ids[2]);
  });
});


