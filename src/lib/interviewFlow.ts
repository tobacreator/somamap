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
 *     -> 503 { error: "unavailable" }                         the turn could not be produced at
 *                                                             all (Phase 2C); never a crisis, and
 *                                                             the client shows its retry line
 *
 * Every request also carries `acknowledgedProvider`: the id of the provider the user was told about
 * and agreed to before the interview started (Phase 2D). It is attached where the request is sent
 * (`InterviewChat`'s `postInterview`), and the route refuses a turn that does not name the disclosed
 * provider - before any adapter is reached, and after the crisis screen. It is not a card field and
 * never becomes one.
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
 * One word the person may borrow (`ISS-26`): what the guided turn offered, or the reviewed vocabulary for
 * the question. The word and its plain explanation - nothing else travels, and nothing here is stored.
 */
export type FlowCandidate = { word: string; meaning: string };

/** The candidates the route offered for the question now on screen, or none when it offered none. */
export function currentOptions(state: InterviewFlowState): readonly FlowCandidate[] {
  return state.phase === "asking" || state.phase === "submitting" ? (state.options ?? []) : [];
}

/**
 * A request body for the interview route.
 *
 * `regionLabel` is the one addition the accuracy fix made (Entry 42), and Phase 2H widened it: the
 * location the person chose on the fixed map **or typed into the location field**, kept as written. It
 * travels so the server can screen it and keep it on the card, and the server ignores nothing about it
 * except control characters and length.
 */
export type InterviewRequest = {
  answers: readonly FlowAnswer[];
  text?: string;
  regionLabel: string;
  /**
   * The description the user wrote on the check-in screen, verbatim (`ISS-16/A`). It travels with
   * every turn, so the server can screen it before the card is worded and keep the user's own first
   * account of the sensation on the card. An empty string means the user wrote nothing.
   */
  description: string;
  /**
   * The question ids this session has been asked, in order (`ISS-26`), or absent when the client keeps no
   * record. It is what lets the guided interview choose the next question: the server cannot derive a
   * choice the model made, so the client's record travels with every turn and is validated as untrusted
   * input (bank ids only, each at most once, lined up with the answers).
   */
  asked?: readonly string[];
};

/** What the route answered, once parsed. Anything this build does not know is `unexpected`. */
export type InterviewResponse =
  | { status: "asking"; question: FlowQuestion; options: readonly FlowCandidate[] }
  | { status: "complete"; card: unknown; usedFallback: boolean }
  | { status: "crisis" }
  | { status: "unexpected"; detail: string };

/**
 * The client's state: one closed set. There is no path to a card that did not arrive in a
 * `complete` answer, and no path out of `crisis` except starting again.
 *
 * Two fields exist for `ISS-14`, and neither changes what any state means:
 *
 *   - `asked` is the questions this session has actually been asked, in order, taken from the
 *     route's own wording. It is kept so a finished session can be shown again question by question
 *     without asking the bank for anything, and so an answer can be labelled with the question it
 *     answered. It never travels to the server.
 *   - `answers` on `complete` is the session the card was worded from. Before this, completion threw
 *     the answers away, which is exactly why the card was a dead end: there was nothing left to edit.
 *
 * `loading`, `crisis` and `failed` carry neither, and `askedOf` returns none for them - the same
 * shape `answersOf` already uses.
 */
export type InterviewFlowState =
  | { phase: "loading"; answers: readonly FlowAnswer[] }
  | { phase: "asking"; question: FlowQuestion; options?: readonly FlowCandidate[]; answers: readonly FlowAnswer[]; asked: readonly FlowQuestion[] }
  | { phase: "submitting"; question: FlowQuestion; options?: readonly FlowCandidate[]; answers: readonly FlowAnswer[]; asked: readonly FlowQuestion[] }
  | {
      phase: "complete";
      card: unknown;
      usedFallback: boolean;
      answers: readonly FlowAnswer[];
      asked: readonly FlowQuestion[];
    }
  | { phase: "crisis" }
  | { phase: "failed"; detail: string };

/** The interview before its first question has arrived. */
export const EMPTY_INTERVIEW_STATE: InterviewFlowState = { phase: "loading", answers: [] };

/**
 * The first request: the empty answer list, no text, the region the user selected (empty when they
 * selected none), and the description they wrote first (empty when they wrote none). The route answers
 * with question one.
 */
export function firstRequest(regionLabel: string, description: string): InterviewRequest {
  // An empty `asked` list is what invites the guide to choose the first question: nothing has been asked,
  // so every reviewed question is still available. Without the list the server falls back to the reviewed
  // sequence, which is what every caller did before `ISS-26`.
  return { answers: [], regionLabel, description, asked: [] };
}

/** The question now on screen, or null when there is none. */
export function currentQuestion(state: InterviewFlowState): FlowQuestion | null {
  return state.phase === "asking" || state.phase === "submitting" ? state.question : null;
}

/** The answers a state carries, or none when the state is past answering. */
export function answersOf(state: InterviewFlowState): readonly FlowAnswer[] {
  return "answers" in state ? state.answers : [];
}

/** The questions a state has been asked, or none when it has been asked none. */
export function askedOf(state: InterviewFlowState): readonly FlowQuestion[] {
  return "asked" in state ? state.asked : [];
}

/**
 * The questions with `question` added, once. A question the session has already been asked is not
 * added again, so a retry - or a revision that re-sends an answer - cannot duplicate it and leave the
 * questions out of step with the answers.
 */
export function withAsked(
  asked: readonly FlowQuestion[],
  question: FlowQuestion,
): readonly FlowQuestion[] {
  return asked.some((candidate) => candidate.id === question.id) ? asked : [...asked, question];
}

/**
 * The request that submits `text` as the answer to the question now on screen, or null when
 * no question is on screen. The answers already given travel unchanged; the new words travel
 * as `text`, which is the shape the route's state machine expects; and the region the user
 * selected and the description they wrote first travel with every turn, so the card cannot lose
 * either (`ISS-16/A`, `ISS-16/F`).
 */
export function answerRequest(
  state: InterviewFlowState,
  text: string,
  regionLabel: string,
  description: string,
): InterviewRequest | null {
  if (state.phase !== "asking" && state.phase !== "submitting") return null;

  return { answers: state.answers, text, regionLabel, description, asked: askedOf(state).map((asked) => asked.id) };
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
    ? { phase: "submitting", question: state.question, options: state.options, answers: state.answers, asked: state.asked }
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

/** The candidates the route offered, or none when they are not readable.
 *
 * A small array of word-and-meaning pairs, and nothing else: anything else in the payload is dropped
 * rather than rendered, and a missing or malformed list simply leaves the screen with the reviewed
 * vocabulary for the question (`ISS-23`), which is what it showed before the guide existed.
 */
function readOptions(value: unknown): readonly FlowCandidate[] {
  if (!Array.isArray(value)) return [];

  const candidates: FlowCandidate[] = [];

  for (const entry of value.slice(0, 4)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;

    const { word, meaning } = entry as { word?: unknown; meaning?: unknown };

    if (typeof word !== "string" || typeof meaning !== "string") continue;
    if (word.trim().length === 0 || meaning.trim().length === 0) continue;

    candidates.push({ word: word.trim(), meaning: meaning.trim() });
  }

  return candidates;
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

  const record = payload as {
    status?: unknown;
    question?: unknown;
    options?: unknown;
    card?: unknown;
    usedFallback?: unknown;
  };

  if (record.status === "crisis") return { status: "crisis" };

  if (record.status === "asking") {
    const question = readQuestion(record.question);

    return question === null
      ? { status: "unexpected", detail: "the question was not readable" }
      : { status: "asking", question, options: readOptions(record.options) };
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
/**
 * The state after the route answered the request that was in flight. `state` is the state the
 * request was sent from, so the answers already given carry forward into the next question.
 *
 * Two things carry forward that did not before (`ISS-14`): the questions already asked, and - once
 * the session completes - the answers the card was worded from. Both come from `state`, so nothing
 * here can invent a question or an answer the session did not have.
 */
export function afterResponse(state: InterviewFlowState, payload: unknown): InterviewFlowState {
  const response = parseResponse(payload);
  const asked = askedOf(state);

  switch (response.status) {
    case "crisis":
      return { phase: "crisis" };
    case "complete":
      return {
        phase: "complete",
        card: response.card,
        usedFallback: response.usedFallback,
        answers: answersOf(state),
        asked,
      };
    case "asking":
      return {
        phase: "asking",
        question: response.question,
        options: response.options,
        answers: answersOf(state),
        asked: withAsked(asked, response.question),
      };
    default:
      return { phase: "failed", detail: response.detail };
  }
}

/* --------------------------------------------------------------- revising a finished session */

/**
 * A local, unsaved revision of a completed session (`ISS-14`): the questions it was asked, the
 * answers as they now stand, and which question is on screen.
 *
 * A draft is UI state and nothing else. It is never sent as a whole, it is never stored, and the only
 * way it can become a card is by going back through the route one answer at a time - which is what
 * `replayPlan` builds.
 */
export type RevisionDraft = {
  asked: readonly FlowQuestion[];
  answers: readonly FlowAnswer[];
  index: number;
};

/**
 * A revision of a completed session, opened on its first question, or null when the state is not a
 * completed session.
 *
 * The answers are taken exactly as the session gave them, in order, and are never re-worded: that is
 * what "preserve all existing answers" means in code. A session whose questions and answers do not
 * line up is refused rather than repaired, because a draft holding an answer with no question could
 * only be shown by inventing one.
 */
export function revisionOf(state: InterviewFlowState): RevisionDraft | null {
  if (state.phase !== "complete") return null;
  if (state.answers.length === 0) return null;
  if (state.asked.length < state.answers.length) return null;

  return { asked: state.asked, answers: state.answers, index: 0 };
}

/** The draft on another question. The index stays inside the questions the session asked. */
export function revisionAt(draft: RevisionDraft, index: number): RevisionDraft {
  const last = Math.max(draft.asked.length - 1, 0);

  return { ...draft, index: Math.min(Math.max(index, 0), last) };
}

/**
 * The draft with the answer on screen replaced by `text`, exactly as typed. Only that answer moves:
 * every other answer, and the question each one answers, is untouched.
 */
export function revisionWithAnswer(draft: RevisionDraft, text: string): RevisionDraft {
  const question = draft.asked[draft.index];

  if (question === undefined) return draft;

  return {
    ...draft,
    answers: draft.answers.map((answer, index) =>
      index === draft.index ? { questionId: question.id, text } : answer,
    ),
  };
}

/** The question the draft is showing, or null when it holds none. */
export function revisionQuestion(draft: RevisionDraft): FlowQuestion | null {
  return draft.asked[draft.index] ?? null;
}

/** The answer the draft is showing, exactly as it was given or last typed. */
export function revisionAnswer(draft: RevisionDraft): string {
  return draft.answers[draft.index]?.text ?? "";
}

/** How many questions the draft can be walked through. */
export function revisionLength(draft: RevisionDraft): number {
  return Math.min(draft.asked.length, draft.answers.length);
}

/** One step of a replay: the request to send, and the state it is sent from. */
export type ReplayStep = { request: InterviewRequest; previous: InterviewFlowState };

/**
 * The requests that carry a revision back through the route, in order - one answer per request.
 *
 * **Every answer travels as `text`, and that is the whole point of the shape.** The route screens the
 * words in `text` for crisis and never screens the `answers` array, so a revision sent as a batch
 * would be the one path into a card the shield does not check. One answer per request means a revised
 * answer is screened exactly as the answer it replaces was, and a revision that turns an answer into
 * crisis language stops at the crisis screen like any other answer.
 *
 * `previous` is the state the step is sent from. It carries the answers up to and including the one
 * being sent, so the last step completes the session and the route words the card from the revised
 * answers. The region the user selected travels on every step, so the card keeps it.
 */
export function replayPlan(
  draft: RevisionDraft,
  regionLabel: string,
  description: string,
): readonly ReplayStep[] {
  const length = revisionLength(draft);

  return Array.from({ length }, (_unused, index) => {
    const question = draft.asked[index];
    const answer = draft.answers[index];

    return {
      request: {
        answers: draft.answers.slice(0, index),
        text: answer.text,
        regionLabel,
        description,
        asked: draft.asked.slice(0, index + 1).map((question) => question.id),
      },
      previous: {
        phase: "asking",
        question,
        options: [],
        answers: draft.answers.slice(0, index + 1),
        asked: draft.asked,
      },
    };
  });
}

