/**
 * The client half of the interview - blueprint Chapter 5.3 (the Day-4 prompt) and Table 10
 * stage 2.
 *
 * The interview itself is not here. The state machine, the question bank, the crisis lexicon
 * and the card's wording all live on the server (`src/lib/interview.ts`, `questionBank.ts`,
 * `crisis.ts`, `models.ts`), and this module repeats none of them: it builds the request
 * bodies `src/app/api/interview/route.ts` expects, reads that route's answers into a closed
 * set of states, and stops there. No question is invented, no card is fabricated, no field is
 * added, and nothing is persisted.
 *
 * The contract, read from the route and its state machine rather than assumed:
 *
 *   POST /api/interview   { answers: [{ questionId, text }], text }
 *     -> 200 { status: "asking",   question: { id, text } }   the next approved question
 *     -> 200 { status: "complete", card, usedFallback }        the validated card, or the
 *                                                             reviewed fallback in its place
 *     -> 200 { status: "crisis" }                             stop; nothing was recorded
 *     -> 400 { error: "invalid request" }                     a body the route refused
 *
 * `answers` carries the answers to the questions already asked, in order; `text` is the
 * answer to the question now on screen. The first question is asked by sending the empty
 * answer list with no text. The card that arrives on completion is handed straight to
 * `CardView`, which validates it against the strict five-field schema and renders the
 * reviewed fallback when it does not pass - the same tested path the red-team rows exercise.
 */

/**
 * The number of questions a session asks. It mirrors `QUESTIONS_PER_SESSION` in
 * `src/lib/interview.ts`, which is the authority; it is repeated here only so the progress
 * line can be drawn without importing the server module (which reads fixtures from disk).
 */
export const QUESTIONS_PER_SESSION = 3;

/** One answer as the route expects it: the question it answers, and the user's own words. */
export type FlowAnswer = { questionId: string; text: string };

/** One question as the route words it: the id, and the approved wording from the bank. */
export type FlowQuestion = { id: string; text: string };

/**
 * A request body for the interview route.
 *
 * `regionLabel` is the one addition the accuracy fix made (Entry 42): the label the user selected on
 * the body map, from the fixed geometric map. It travels so the server can keep the user's own
 * selection on the card, and the server ignores anything that is not one of the fourteen labels.
 */
export type InterviewRequest = { answers: readonly FlowAnswer[]; text?: string; regionLabel: string };

/** What the route answered, once parsed. Anything this build does not know is `unexpected`. */
export type InterviewResponse =
  | { status: "asking"; question: FlowQuestion }
  | { status: "complete"; card: unknown; usedFallback: boolean }
  | { status: "crisis" }
  | { status: "unexpected"; detail: string };

/**
 * The client's state: one closed set. There is no path to a card that did not arrive in a
 * `complete` answer, and no path out of `crisis` except starting again.
 */
export type InterviewFlowState =
  | { phase: "loading"; answers: readonly FlowAnswer[] }
  | { phase: "asking"; question: FlowQuestion; answers: readonly FlowAnswer[] }
  | { phase: "submitting"; question: FlowQuestion; answers: readonly FlowAnswer[] }
  | { phase: "complete"; card: unknown; usedFallback: boolean }
  | { phase: "crisis" }
  | { phase: "failed"; detail: string };

/** The interview before its first question has arrived. */
export const EMPTY_INTERVIEW_STATE: InterviewFlowState = { phase: "loading", answers: [] };

/**
 * The first request: the empty answer list, no text, and the region the user selected (empty when
 * they selected none). The route answers with question one.
 */
export function firstRequest(regionLabel: string): InterviewRequest {
  return { answers: [], regionLabel };
}

/** The question now on screen, or null when there is none. */
export function currentQuestion(state: InterviewFlowState): FlowQuestion | null {
  return state.phase === "asking" || state.phase === "submitting" ? state.question : null;
}

/** The answers a state carries, or none when the state is past answering. */
export function answersOf(state: InterviewFlowState): readonly FlowAnswer[] {
  return "answers" in state ? state.answers : [];
}

/**
 * The request that submits `text` as the answer to the question now on screen, or null when
 * no question is on screen. The answers already given travel unchanged; the new words travel
 * as `text`, which is the shape the route's state machine expects; and the region the user
 * selected travels with every turn, so the card cannot lose it.
 */
export function answerRequest(state: InterviewFlowState, text: string, regionLabel: string): InterviewRequest | null {
  if (state.phase !== "asking" && state.phase !== "submitting") return null;

  return { answers: state.answers, text, regionLabel };
}

/**
 * The client's own record of the answers after `text` answers the question now on screen. It
 * is what the next request carries, and it is never displayed: the card's wording comes from
 * the route.
 */
export function answersWith(state: InterviewFlowState, text: string): readonly FlowAnswer[] {
  if (state.phase !== "asking" && state.phase !== "submitting") return [];

  return [...state.answers, { questionId: state.question.id, text }];
}

/** The same state, marked as waiting on the route. */
export function asInFlight(state: InterviewFlowState): InterviewFlowState {
  return state.phase === "asking" || state.phase === "submitting"
    ? { phase: "submitting", question: state.question, answers: state.answers }
    : { phase: "loading", answers: [] };
}

/** A position in the interview, as the progress meter shows it. */
export type InterviewProgress = { step: number; total: number };

function clamp(step: number, total: number): number {
  return Math.min(Math.max(step, 1), total);
}

/**
 * The question the screen is showing, one-based, or null when no question is on screen yet.
 *
 * The number always describes the question the user is looking at:
 *
 *   - `asking`     the question on screen has not been answered, so it is the one after the answers
 *                  already given;
 *   - `submitting` the question on screen HAS been answered - the in-flight state carries that
 *                  answer - and the next question has not arrived, so the number stays on it. This
 *                  is the case the old `stepNumber` counted one step ahead of the screen;
 *   - `complete`   the session's last question;
 *   - `loading`, `crisis`, `failed`  no question is on screen, so there is no number to show.
 *
 * Display only: nothing about the interview's contract changes. The invariant this relies on - in
 * the `submitting` phase, `answers` includes the answer to the question still on screen - is
 * asserted in the tests beside this module.
 */
export function progressFor(state: InterviewFlowState): InterviewProgress | null {
  const total = QUESTIONS_PER_SESSION;

  if (state.phase === "complete") return { step: total, total };

  if (state.phase === "asking") return { step: clamp(state.answers.length + 1, total), total };

  if (state.phase === "submitting") return { step: clamp(state.answers.length, total), total };

  return null;
}

/** A question, or null when the payload does not carry one this build can show. */
function readQuestion(value: unknown): FlowQuestion | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;

  const { id, text } = value as { id?: unknown; text?: unknown };

  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof text !== "string" || text.length === 0) return null;

  return { id, text };
}

/**
 * The route's answer, parsed and closed. Unknown statuses, missing questions and missing
 * cards are all `unexpected` - never a state that could render a card - so a changed or
 * hostile response cannot be mistaken for a finished interview.
 */
export function parseResponse(payload: unknown): InterviewResponse {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { status: "unexpected", detail: "the answer was not an object" };
  }

  const record = payload as { status?: unknown; question?: unknown; card?: unknown; usedFallback?: unknown };

  if (record.status === "crisis") return { status: "crisis" };

  if (record.status === "asking") {
    const question = readQuestion(record.question);

    return question === null
      ? { status: "unexpected", detail: "the question was not readable" }
      : { status: "asking", question };
  }

  if (record.status === "complete") {
    if (record.card === null || record.card === undefined) {
      return { status: "unexpected", detail: "the card was missing" };
    }

    // The card itself is not judged here: CardView validates it against the strict schema and
    // renders the reviewed fallback when it does not pass.
    return { status: "complete", card: record.card, usedFallback: record.usedFallback === true };
  }

  return { status: "unexpected", detail: "the status was not one this interview knows" };
}

/**
 * The state after the route answered the request that was in flight. `state` is the state the
 * request was sent from, so the answers already given carry forward into the next question.
 */
export function afterResponse(state: InterviewFlowState, payload: unknown): InterviewFlowState {
  const response = parseResponse(payload);

  switch (response.status) {
    case "crisis":
      return { phase: "crisis" };
    case "complete":
      return { phase: "complete", card: response.card, usedFallback: response.usedFallback };
    case "asking":
      return { phase: "asking", question: response.question, answers: answersOf(state) };
    default:
      return { phase: "failed", detail: response.detail };
  }
}

