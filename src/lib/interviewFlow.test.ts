import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interviewFixture } from "./fixtures.ts";
import {
  EMPTY_INTERVIEW_STATE,
  QUESTIONS_PER_SESSION,
  afterResponse,
  answerRequest,
  answersWith,
  askedOf,
  asInFlight,
  currentQuestion,
  firstRequest,
  parseResponse,
  progressFor,
  replayPlan,
  revisionAnswer,
  revisionAt,
  revisionLength,
  revisionOf,
  revisionQuestion,
  revisionWithAnswer,
  type InterviewFlowState,
  type RevisionDraft,
} from "./interviewFlow.ts";
import { interviewStep as stateMachine, questionForStep, type InterviewDeps, type InterviewStepResult } from "./interview.ts";
import { acknowledgementFor } from "./externalProcessing.ts";

/**
 * A turn as a real client sends it (Phase 2D): the interview's own fields, plus the acknowledgement of
 * the provider the user was told about before the interview started. `stateMachine` is the raw call,
 * and the tests that prove what happens *without* an acknowledgement use it directly.
 *
 * Non-objects are passed through untouched, so an unexpected request shape still exercises exactly
 * what it did before.
 */
function acknowledgedTurn(body: unknown, depsForTurn: InterviewDeps): Promise<InterviewStepResult> {
  const acknowledged =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? { ...body, acknowledgedProvider: acknowledgementFor(depsForTurn.mode) }
      : body;

  return stateMachine(acknowledged, depsForTurn);
}
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

/**
 * The route's mapping from the state machine's result to the response body it sends.
 *
 * Asynchronous because the state machine is (Phase 1, the async foundation): it awaits the
 * wording of the card, so every caller of this helper awaits it too.
 */
async function routeAnswer(body: unknown): Promise<unknown> {
  const result = await acknowledgedTurn(body, deps());

  if (result.status === "asking") return { status: result.status, question: result.question };
  if (result.status === "complete") {
    return { status: result.status, card: result.card, usedFallback: result.usedFallback };
  }

  return { status: "crisis" };
}

describe("the request bodies the client builds", () => {
  it("asks the first question with the empty answer list, no text, the region, and the description", () => {
    assert.deepEqual(firstRequest("shoulder", ""), {
      answers: [],
      regionLabel: "shoulder",
      description: "",
      asked: [],
    });
    // No region selected travels as an empty label: the client never guesses one. An empty description
    // travels too, so the wire shape is the same whether the user wrote anything or not. The empty
    // `asked` list is what invites the guided turn to choose the first question (`ISS-26`).
    assert.deepEqual(firstRequest("", ""), { answers: [], regionLabel: "", description: "", asked: [] });

    // Phase 2H: the location is the person's own words, so a label the fixed map does not know travels
    // exactly as a map label does - on the first request and on every one after it.
    assert.deepEqual(firstRequest("left wrist", ""), {
      answers: [],
      regionLabel: "left wrist",
      description: "",
      asked: [],
    });
    // The description the user wrote first travels verbatim (`ISS-16/A`).
    assert.deepEqual(firstRequest("chest", "a heavy band across my chest"), {
      answers: [],
      regionLabel: "chest",
      description: "a heavy band across my chest",
      asked: [],
    });
  });

  it("sends the answers already given plus the new words as text, and the region again", () => {
    const state: InterviewFlowState = {
      phase: "asking",
      question: { id: "Q4", text: "the bank's wording" },
      answers: [{ questionId: "Q1", text: ORDINARY[0] }],
      asked: [{ id: "Q1", text: "the bank's wording" }],
    };

    assert.deepEqual(answerRequest(state, ORDINARY[1], "shoulder", "a heavy band"), {
      answers: [{ questionId: "Q1", text: ORDINARY[0] }],
      text: ORDINARY[1],
      regionLabel: "shoulder",
      description: "a heavy band",
      // The record of what this session was asked (`ISS-26`): the questions the flow state holds, which
      // is what lets the route hand the choice of the next question to the guide.
      asked: ["Q1"],
    });
  });

  it("records the answer against the question that was on screen", () => {
    const state: InterviewFlowState = {
      phase: "asking",
      question: { id: "Q4", text: "the bank's wording" },
      answers: [{ questionId: "Q1", text: ORDINARY[0] }],
      asked: [{ id: "Q1", text: "the bank's wording" }],
    };

    assert.deepEqual(answersWith(state, ORDINARY[1]), [
      { questionId: "Q1", text: ORDINARY[0] },
      { questionId: "Q4", text: ORDINARY[1] },
    ]);
  });

  it("builds nothing when no question is on screen", () => {
    assert.equal(answerRequest(EMPTY_INTERVIEW_STATE, "words", "", ""), null);
    assert.equal(answerRequest({ phase: "crisis" }, "words", "", ""), null);
    assert.deepEqual(
      answersWith({ phase: "complete", card: {}, usedFallback: false, answers: [], asked: [] }, "words"),
      [],
    );
    assert.equal(currentQuestion(EMPTY_INTERVIEW_STATE), null);
  });

  it("marks a state as waiting on the route", () => {
    const asking: InterviewFlowState = {
      phase: "asking",
      question: { id: "Q1", text: "the bank's wording" },
      answers: [],
      asked: [{ id: "Q1", text: "the bank's wording" }],
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
      asked: Array.from({ length: given }, (_unused, index) => ({ id: `Q${index + 1}`, text: "the bank's wording" })),
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
      asked: Array.from({ length: answered }, (_unused, index) => ({ id: `Q${index + 1}`, text: "the bank's wording" })),
    });

    assert.deepEqual(progressFor(inFlight(1)), { step: 1, total: QUESTIONS_PER_SESSION });
    assert.deepEqual(progressFor(inFlight(2)), { step: 2, total: QUESTIONS_PER_SESSION });
    assert.deepEqual(progressFor(inFlight(3)), { step: 3, total: QUESTIONS_PER_SESSION });
  });

  it("shows the last question when the session is complete, and no number when there is no question", () => {
    assert.deepEqual(
      progressFor({ phase: "complete", card: {}, usedFallback: false, answers: [], asked: [] }),
      {
        step: QUESTIONS_PER_SESSION,
        total: QUESTIONS_PER_SESSION,
      },
    );

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
      asked: [{ id: "Q1", text: "the bank's wording" }],
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
  async function turn(state: InterviewFlowState, text: string): Promise<InterviewFlowState> {
    const request = answerRequest(state, text, REGION, "");
    const question = currentQuestion(state);

    if (request === null || question === null) {
      throw new Error("the interview must have a question on screen before an answer is sent");
    }

    // The contract proof: the state machine itself must accept the body the client built.
    assert.notEqual((await acknowledgedTurn(request, deps())).status, "invalid");

    return afterResponse(
      { phase: "asking", question, answers: answersWith(state, text), asked: askedOf(state) },
      await routeAnswer(request),
    );
  }

  it("walks the three approved questions and completes with a card built from the answers", async () => {
    let state = afterResponse(EMPTY_INTERVIEW_STATE, await routeAnswer(firstRequest(REGION, "")));

    assert.equal(state.phase, "asking");
    assert.equal(state.phase === "asking" ? state.question.id : "", interviewFixture.question_ids[0]);
    assert.equal(
      state.phase === "asking" ? state.question.text : "",
      questionById(interviewFixture.question_ids[0])?.text,
    );

    for (const [index, text] of ORDINARY.entries()) {
      state = await turn(state, text);

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
    // The sentence is the longest answer that is neither the duration nor the comparison (`ISS-16/B`).
    // This session's comparison is ORDINARY[1] - it is the phrase that contains "like" - so it fills
    // "It feels like" and the sentence falls to the longest of the remaining two. The same sentence is
    // no longer shown in two rows.
    assert.equal(
      card !== null && typeof card === "object" ? (card as { user_own_sentence: string }).user_own_sentence : "",
      ORDINARY[2],
    );
    assert.equal(
      card !== null && typeof card === "object" ? (card as { intensity_metaphor: string }).intensity_metaphor : "",
      ORDINARY[1],
    );
    // No question in the shipped sequence asks how long, and the comparison question's answer is not
    // read as a duration (`ISS-16/E`), so the row is honestly empty.
    assert.equal(
      card !== null && typeof card === "object" ? (card as { duration: string }).duration : "not a card",
      "",
    );
    assert.notDeepEqual(card, interviewFixture.draft_card);
    assert.equal(state.phase === "complete" ? state.usedFallback : null, false);
  });

  it("stops at the crisis answer, with no card in the state at all", async () => {
    const state = afterResponse(EMPTY_INTERVIEW_STATE, await routeAnswer(firstRequest(REGION, "")));

    assert.equal(state.phase, "asking");

    const stopped = await turn(state, CRISIS);

    assert.equal(stopped.phase, "crisis");
    assert.equal("card" in stopped, false);
    assert.equal(stopped.phase === "crisis" ? Object.keys(stopped).length : 0, 1);
  });

  it("asks exactly the number of questions the session promises", () => {
    assert.equal(interviewFixture.question_ids.length, QUESTIONS_PER_SESSION);
    assert.equal(questionForStep(QUESTIONS_PER_SESSION - 1, mockAdapter).id, interviewFixture.question_ids[2]);
  });
});

describe("revising a finished session (ISS-14)", () => {
  /** The region the map handed the flow in these tests. */
  const REGION = "shoulder";
  /** A second region, for the "change the region" path. */
  const OTHER_REGION = "knees";
  /**
   * A revised answer. It is deliberately the longest of the three, because the card's own sentence is
   * the longest answer that is not the time phrase - so the test can tell which words reached it.
   */
  const REVISED = "like a band pulled tight around it";
  /**
   * The description the user wrote on the check-in screen before any question was asked
   * (`ISS-16/A`). It is longer than any of the three answers, so the card quotes it when it is there.
   */
  const DESCRIPTION = "a heavy band across my chest that I have noticed since this morning";

  /** The three answers as the session records them, in order. */
  const AS_GIVEN = ORDINARY.map((text, index) => ({ questionId: interviewFixture.question_ids[index], text }));

  /** One turn, taken exactly as the screen takes it. */
  async function turn(state: InterviewFlowState, text: string, regionLabel = REGION, description = ""): Promise<InterviewFlowState> {
    const question = currentQuestion(state);
    const request = answerRequest(state, text, regionLabel, description);

    if (question === null || request === null) throw new Error("the interview had no question on screen");

    // The contract proof, as above: the state machine must accept the body the client built.
    assert.notEqual((await acknowledgedTurn(request, deps())).status, "invalid");

    return afterResponse(
      { phase: "asking", question, answers: answersWith(state, text), asked: askedOf(state) },
      await routeAnswer(request),
    );
  }

  /** A finished session, reached the way the screen reaches it. */
  async function completed(regionLabel = REGION, description = ""): Promise<InterviewFlowState> {
    let state = afterResponse(EMPTY_INTERVIEW_STATE, await routeAnswer(firstRequest(regionLabel, description)));

    for (const answer of ORDINARY) state = await turn(state, answer, regionLabel, description);

    assert.equal(state.phase, "complete");

    return state;
  }

  /** A revision carried back through the real route, one answer at a time, as the screen sends it. */
  async function replayThrough(draft: RevisionDraft, regionLabel = REGION, description = ""): Promise<InterviewFlowState> {
    let state: InterviewFlowState = EMPTY_INTERVIEW_STATE;

    for (const step of replayPlan(draft, regionLabel, description)) {
      assert.notEqual((await acknowledgedTurn(step.request, deps())).status, "invalid");

      state = afterResponse(step.previous, await routeAnswer(step.request));

      if (state.phase === "crisis" || state.phase === "failed") return state;
    }

    return state;
  }

  it("keeps the answers and the questions a completed card was worded from", async () => {
    const state = await completed();

    assert.equal(state.phase === "complete" ? state.answers.length : 0, QUESTIONS_PER_SESSION);
    assert.equal(state.phase === "complete" ? state.asked.length : 0, QUESTIONS_PER_SESSION);
    assert.deepEqual(state.phase === "complete" ? state.answers : [], AS_GIVEN);
  });

  it("opens a revision on the first question with every answer as it was given", async () => {
    const draft = revisionOf(await completed());

    assert.notEqual(draft, null);

    if (draft === null) return;

    assert.equal(draft.index, 0);
    assert.deepEqual(draft.answers, AS_GIVEN);
    assert.equal(revisionQuestion(draft)?.id, interviewFixture.question_ids[0]);
    assert.equal(revisionAnswer(draft), ORDINARY[0]);
    assert.equal(revisionLength(draft), QUESTIONS_PER_SESSION);
  });

  it("offers a revision only for a completed session", async () => {
    assert.equal(revisionOf(EMPTY_INTERVIEW_STATE), null);
    assert.equal(revisionOf(afterResponse(EMPTY_INTERVIEW_STATE, await routeAnswer(firstRequest(REGION, "")))), null);
    assert.equal(revisionOf({ phase: "crisis" }), null);
    assert.equal(revisionOf({ phase: "failed", detail: "the route answered 500" }), null);
  });

  it("moves between the questions the session asked, and no further", async () => {
    const draft = revisionOf(await completed());

    assert.notEqual(draft, null);

    if (draft === null) return;

    assert.equal(revisionAt(draft, -5).index, 0);
    assert.equal(revisionAt(draft, 1).index, 1);
    assert.equal(revisionAt(draft, 99).index, QUESTIONS_PER_SESSION - 1);
    assert.equal(revisionQuestion(revisionAt(draft, 1))?.id, interviewFixture.question_ids[1]);
    assert.equal(revisionAnswer(revisionAt(draft, 2)), ORDINARY[2]);
  });

  it("replaces only the answer being revised, and keeps the question it answers", async () => {
    const draft = revisionOf(await completed());

    assert.notEqual(draft, null);

    if (draft === null) return;

    const revised = revisionWithAnswer(revisionAt(draft, 1), REVISED);

    assert.deepEqual(revised.answers[1], { questionId: interviewFixture.question_ids[1], text: REVISED });
    assert.deepEqual(revised.answers[0], draft.answers[0]);
    assert.deepEqual(revised.answers[2], draft.answers[2]);
  });

  it("sends a revision one answer at a time, each as text - the only shape the shield screens", async () => {
    const draft = revisionOf(await completed());

    assert.notEqual(draft, null);

    if (draft === null) return;

    const plan = replayPlan(draft, REGION, "");

    assert.equal(plan.length, QUESTIONS_PER_SESSION);

    plan.forEach((step, index) => {
      // The route screens `text` and never screens `answers`. If a revision ever travelled as a batch
      // this assertion would be the first thing to fail, which is the point of it.
      assert.equal(step.request.text, ORDINARY[index], `step ${index + 1} must carry its answer as text`);
      assert.deepEqual(step.request.answers, draft.answers.slice(0, index));
      assert.equal(step.request.regionLabel, REGION);
      assert.equal(step.previous.phase === "asking" ? step.previous.answers.length : -1, index + 1);
    });
  });

  it("rebuilds the card from the revised answers", async () => {
    const draft = revisionOf(await completed());

    assert.notEqual(draft, null);

    if (draft === null) return;

    const revised = revisionWithAnswer(revisionAt(draft, 1), REVISED);
    const state = await replayThrough(revised);

    assert.equal(state.phase, "complete");
    assert.equal(state.phase === "complete" ? state.usedFallback : null, false);
    assert.deepEqual(state.phase === "complete" ? state.answers : [], revised.answers);

    const card =
      state.phase === "complete"
        ? (state.card as { location_label: string; user_own_sentence: string; intensity_metaphor: string })
        : null;

    assert.equal(card?.location_label, REGION);
    // The revised answer is the phrase that carries "like", so it fills the comparison row, and the
    // sentence falls to the longest of what is left rather than repeating it (`ISS-16/B`).
    assert.equal(card?.intensity_metaphor, REVISED);
    assert.equal(card?.user_own_sentence, ORDINARY[2]);
    assert.notEqual(card?.user_own_sentence, REVISED);
  });

  it("reproduces the same card when nothing was changed", async () => {
    const first = await completed();
    const draft = revisionOf(first);

    assert.notEqual(draft, null);

    if (draft === null) return;

    const state = await replayThrough(draft);

    assert.equal(state.phase, "complete");
    assert.deepEqual(
      state.phase === "complete" ? state.card : null,
      first.phase === "complete" ? first.card : null,
    );
  });

  it("stops at the crisis screen when a revised answer carries crisis language, and produces no card", async () => {
    const draft = revisionOf(await completed());

    assert.notEqual(draft, null);

    if (draft === null) return;

    const state = await replayThrough(revisionWithAnswer(revisionAt(draft, 2), CRISIS));

    assert.equal(state.phase, "crisis");
    assert.equal("card" in state, false);
  });

  it("rebuilds the card with the new region when the region changes, and keeps the answers", async () => {
    const draft = revisionOf(await completed());

    assert.notEqual(draft, null);

    if (draft === null) return;

    const state = await replayThrough(draft, OTHER_REGION);

    assert.equal(state.phase, "complete");
    assert.deepEqual(state.phase === "complete" ? state.answers : [], AS_GIVEN);
    assert.equal(
      state.phase === "complete" ? (state.card as { location_label: string }).location_label : "",
      OTHER_REGION,
    );
  });

  it("carries the description through a revision, verbatim, on every step", async () => {
    const draft = revisionOf(await completed());

    assert.notEqual(draft, null);

    if (draft === null) return;

    const plan = replayPlan(draft, REGION, DESCRIPTION);

    assert.equal(plan.length, QUESTIONS_PER_SESSION);

    for (const step of plan) {
      assert.equal(step.request.description, DESCRIPTION, "the description travels with every turn");
    }
  });

  it("keeps the description when the region changes", async () => {
    const draft = revisionOf(await completed());

    assert.notEqual(draft, null);

    if (draft === null) return;

    const state = await replayThrough(draft, OTHER_REGION, DESCRIPTION);

    assert.equal(state.phase, "complete");

    const card =
      state.phase === "complete"
        ? (state.card as { location_label: string; user_own_sentence: string; intensity_metaphor: string })
        : null;

    assert.equal(card?.location_label, OTHER_REGION, "the new region reached the card");
    assert.equal(card?.user_own_sentence, DESCRIPTION, "and the description survived the change");
  });

  it("stops at the crisis screen when a revised answer carries crisis language, description and all", async () => {
    const draft = revisionOf(await completed());

    assert.notEqual(draft, null);

    if (draft === null) return;

    const state = await replayThrough(revisionWithAnswer(revisionAt(draft, 2), CRISIS), REGION, DESCRIPTION);

    assert.equal(state.phase, "crisis");
    assert.equal("card" in state, false);
  });

  it("carries the region on every step of a revision", async () => {
    const draft = revisionOf(await completed());

    assert.notEqual(draft, null);

    if (draft === null) return;

    for (const step of replayPlan(draft, OTHER_REGION, "")) {
      assert.equal(step.request.regionLabel, OTHER_REGION);
    }
  });
});



