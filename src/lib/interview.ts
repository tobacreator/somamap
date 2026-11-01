import { regionLabelFrom } from "./cardFidelity.ts";
import { QUESTION_BANK, questionById } from "./questionBank.ts";
import {
  wordCard,
  type ModelAdapter,
  type ModelAnswer,
  type ModelMode,
  type ViolationLogger,
} from "./models.ts";
import type { SensationCard } from "./schema.ts";

/**
 * The interview state machine - blueprint Table 10 stage 2 and Chapter 5.3.
 *
 * Three properties are the whole of this file, and each one is structural rather than a
 * filter:
 *
 *   1. The bank is authoritative. The next question id is looked up in
 *      src/lib/questionBank.ts, and the wording always comes from the bank. An id the
 *      bank does not know falls back to the bank's first question (Table 10 stage 2),
 *      and a client whose answers do not match the questions actually asked is refused.
 *   2. A user's words are data, never instructions. The text of an answer is stored as an
 *      answer and handed to the adapter; nothing in it is read as a rule, so no phrasing
 *      can change the sequence, the questions or the safety steps.
 *   3. Crisis comes first. Every answer is screened before anything else looks at it, and
 *      a crisis hit returns immediately with nothing recorded.
 *
 * Exactly three questions are asked per session, then the draft is worded and validated
 * through the model boundary. Nothing here writes to a database.
 */

/** Table 10 stage 2 and Chapter 5.3: three questions per session. */
export const QUESTIONS_PER_SESSION = 3;

/** One answer as the client sent it: the question it answered, and the words. */
export type InterviewAnswer = ModelAnswer;

export type InterviewDeps = {
  adapter: ModelAdapter;
  logger: ViolationLogger;
  mode: ModelMode;
};

export type InterviewQuestion = { id: string; text: string };

export type InterviewStepResult =
  | { status: "invalid"; reason: string }
  | { status: "crisis" }
  | { status: "asking"; question: InterviewQuestion; answers: readonly InterviewAnswer[] }
  | { status: "complete"; card: SensationCard; usedFallback: boolean; answers: readonly InterviewAnswer[] };

/**
 * The question for a step, from the bank. An id the bank does not know - including an id a
 * model asked for that does not exist - falls back to the bank's first question, so a
 * selection problem can never invent a question or skip the bank.
 */
export function questionForStep(step: number, adapter: ModelAdapter): InterviewQuestion {
  const first = QUESTION_BANK[0];
  const sequence = adapter.questionSequence();
  const candidate = Array.isArray(sequence) ? sequence[step] : undefined;
  const chosen = typeof candidate === "string" ? questionById(candidate) : null;
  const question = chosen ?? first;

  // Only the id and the approved wording travel: the texture column is review metadata,
  // not something a client needs, and the bank stays the single source of the wording.
  return { id: question.id, text: question.text };
}

type ParsedTurn =
  | { ok: true; answers: InterviewAnswer[]; text: string | null; regionLabel: string | null }
  | { ok: false; reason: string };

/** Unexpected input fails closed: nothing is guessed and nothing is coerced. */
function parseTurn(body: unknown): ParsedTurn {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "the request body is not an object" };
  }

  const raw = body as { answers?: unknown; text?: unknown; regionLabel?: unknown };
  const answersRaw = raw.answers === undefined ? [] : raw.answers;

  if (!Array.isArray(answersRaw)) return { ok: false, reason: "answers is not an array" };
  if (answersRaw.length > QUESTIONS_PER_SESSION) return { ok: false, reason: "too many answers" };

  const answers: InterviewAnswer[] = [];

  for (const entry of answersRaw) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, reason: "an answer is not an object" };
    }

    const { questionId, text } = entry as { questionId?: unknown; text?: unknown };

    if (typeof questionId !== "string" || typeof text !== "string") {
      return { ok: false, reason: "an answer is missing its question id or its words" };
    }

    answers.push({ questionId, text });
  }

  if (raw.text !== undefined && raw.text !== null && typeof raw.text !== "string") {
    return { ok: false, reason: "text is not a string" };
  }

  if (raw.regionLabel !== undefined && raw.regionLabel !== null && typeof raw.regionLabel !== "string") {
    return { ok: false, reason: "regionLabel is not a string" };
  }

  return {
    ok: true,
    answers,
    text: typeof raw.text === "string" ? raw.text : null,
    regionLabel: typeof raw.regionLabel === "string" ? raw.regionLabel : null,
  };
}

/** The answers must be the ones this session actually asked for, in order. */
function answersFollowTheSequence(answers: readonly InterviewAnswer[], adapter: ModelAdapter): boolean {
  return answers.every((answer, index) => answer.questionId === questionForStep(index, adapter).id);
}

/**
 * One turn of the interview: the answers so far, plus the new words if there are any.
 * Crisis, then the next question, then the card - in that order and nothing else.
 */
export function interviewStep(body: unknown, deps: InterviewDeps): InterviewStepResult {
  const parsed = parseTurn(body);

  if (!parsed.ok) return { status: "invalid", reason: parsed.reason };

  if (!answersFollowTheSequence(parsed.answers, deps.adapter)) {
    return { status: "invalid", reason: "the answers do not match the questions this session asked" };
  }

  // The session is over once it has its three answers: a further answer is not a turn.
  if (parsed.text !== null && parsed.answers.length >= QUESTIONS_PER_SESSION) {
    return { status: "invalid", reason: "the session already has all of its answers" };
  }

  const answers: InterviewAnswer[] = [...parsed.answers];

  if (parsed.text !== null) {
    // Iron rule 4 first, before anything else reads the words.
    if (deps.adapter.prescreen(parsed.text).crisis) return { status: "crisis" };

    // The words become an answer and nothing more. No instruction inside them is acted on.
    answers.push({ questionId: questionForStep(answers.length, deps.adapter).id, text: parsed.text });
  }

  if (answers.length >= QUESTIONS_PER_SESSION) {
    // The region is normalised against the fixed map here: a client that sends an unknown label
    // sends no region at all, so no invented name can reach the card.
    const worded = wordCard({ answers, regionLabel: regionLabelFrom(parsed.regionLabel) }, deps);

    return { status: "complete", card: worded.card, usedFallback: worded.usedFallback, answers };
  }

  return { status: "asking", question: questionForStep(answers.length, deps.adapter), answers };
}
