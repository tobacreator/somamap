import { isCrisisLanguage } from "./crisis.ts";
import { isAcknowledgement } from "./externalProcessing.ts";
import { userLocationFrom } from "./cardFidelity.ts";
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
 * through the model boundary. The step is asynchronous because that wording is: the boundary
 * awaits the adapter, and this function awaits the boundary rather than handing a caller a
 * half-built card. Nothing here writes to a database.
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
  | {
      ok: true;
      answers: InterviewAnswer[];
      text: string | null;
      regionLabel: string | null;
      description: string | null;
      /**
       * The provider id the client says the user was told about and agreed to (Phase 2D), or null
       * when the field is absent or is not a string. Read here, **enforced** in `interviewStep` after
       * the crisis screen, so a turn that does not name the disclosed provider is refused before any
       * adapter method is reached.
       */
      acknowledgedProvider: string | null;
    }
  | { ok: false; reason: string };

/** Unexpected input fails closed: nothing is guessed and nothing is coerced. */
function parseTurn(body: unknown): ParsedTurn {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "the request body is not an object" };
  }

  const raw = body as {
    answers?: unknown;
    text?: unknown;
    regionLabel?: unknown;
    description?: unknown;
    acknowledgedProvider?: unknown;
  };
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

  if (raw.description !== undefined && raw.description !== null && typeof raw.description !== "string") {
    return { ok: false, reason: "description is not a string" };
  }

  return {
    ok: true,
    answers,
    text: typeof raw.text === "string" ? raw.text : null,
    regionLabel: typeof raw.regionLabel === "string" ? raw.regionLabel : null,
    description: typeof raw.description === "string" ? raw.description : null,
    acknowledgedProvider: typeof raw.acknowledgedProvider === "string" ? raw.acknowledgedProvider : null,
  };
}

/**
 * Every piece of user-authored text one turn can carry: the answers already given, in order, then the
 * words just submitted, then the description written on the check-in screen before any question was
 * asked, and then the location the person chose or typed (`Phase 2H`).
 *
 * The location belongs here because it became free text. While it could only ever be one of the fixed
 * map's fourteen labels it needed no screening - there was nothing in it a person had written. A typed
 * location is the person's own words, so it is screened exactly as an answer is, on the server, on
 * every turn, before anything is worded or sent anywhere.
 *
 * Only the user's own words are here - no model text, no question wording - which is what keeps iron
 * rule 4's trigger "language, never a pattern of sensations".
 */
function userAuthoredText(parsed: Extract<ParsedTurn, { ok: true }>): readonly string[] {
  const alreadyGiven = parsed.answers.map((answer) => answer.text);
  const justSubmitted = parsed.text === null ? [] : [parsed.text];
  const writtenFirst = parsed.description === null ? [] : [parsed.description];
  const chosenLocation = parsed.regionLabel === null ? [] : [parsed.regionLabel];

  return [...alreadyGiven, ...justSubmitted, ...writtenFirst, ...chosenLocation];
}

/** The answers must be the ones this session actually asked for, in order. */
function answersFollowTheSequence(answers: readonly InterviewAnswer[], adapter: ModelAdapter): boolean {
  return answers.every((answer, index) => answer.questionId === questionForStep(index, adapter).id);
}

/**
 * One turn of the interview: the answers so far, plus the new words if there are any.
 * Crisis, then the next question, then the card - in that order and nothing else.
 *
 * Asynchronous because the last of those steps is: the card is worded through the model
 * boundary, which awaits the adapter. The order is unchanged - the crisis check still runs
 * before anything reads the words, and long before the wording is awaited. Since Phase 2C that
 * check reads every piece of the user's own text rather than the two fields it used to, and it is
 * decided by the local lexicon rather than through the adapter, so a provider failure cannot
 * produce or suppress a crisis.
 */
export async function interviewStep(body: unknown, deps: InterviewDeps): Promise<InterviewStepResult> {
  const parsed = parseTurn(body);

  if (!parsed.ok) return { status: "invalid", reason: parsed.reason };

  /**
   * Iron rule 4, and it comes first: before the sequence is judged, before the session is judged
   * complete, and long before anything is worded or saved.
   *
   * Every piece of user-authored text this request carries is screened with the **local** lexicon in
   * `crisis.ts` - the answers already given, the words just submitted, and the description written on
   * the check-in screen (`ISS-16/A`) - and a match stops the loop here, returning the static crisis
   * result with no card, no session and nothing to save.
   *
   * The decision is taken **here**, by the lexicon, and never by the adapter: no provider status, no
   * provider failure, no timeout and no model output can produce, prevent or alter it. That is what
   * makes "provider failure is never a crisis" structural rather than a matter of adapter discipline,
   * and it is why an adapter whose every method throws cannot change the outcome. The client screens
   * the box and every answer too; this is the server-side guarantee underneath it, so a client that
   * skipped its own check cannot slip text past the shield.
   */
  if (userAuthoredText(parsed).some((text) => isCrisisLanguage(text))) return { status: "crisis" };

  /**
   * External processing is an explicit, informed act (Phase 2D), and this is where it is enforced: on
   * the server, before any adapter method is reached, and after the crisis screen rather than before it.
   *
   * Every turn must carry the acknowledgement **this mode's disclosure asked for**: the provider's id
   * in live mode, or `local` in mock mode, where nothing is sent anywhere. The check is an equality
   * test against one derived value (`isAcknowledgement`), so absent, malformed, a boolean, a number, an
   * empty string, another provider's name, a differently-cased spelling and the acknowledgement of the
   * other mode are all refused - and refused **before** `answersFollowTheSequence`, the first call that
   * reaches the adapter, so no provider can be invoked for a session whose user was never asked. The
   * refusal is a plain `invalid`: the caller learns nothing about the inside of the machine, and
   * nothing is worded, generated, logged or saved.
   *
   * The order is deliberate and asserted: crisis language wins over a missing acknowledgement, because
   * the shield is iron rule 4 and comes first. A request that is both in crisis and unacknowledged
   * still stops the loop at the static crisis screen.
   */
  if (!isAcknowledgement(parsed.acknowledgedProvider, deps.mode)) {
    return {
      status: "invalid",
      reason: "the external processing acknowledgement is missing, malformed, or names another provider",
    };
  }

  if (!answersFollowTheSequence(parsed.answers, deps.adapter)) {
    return { status: "invalid", reason: "the answers do not match the questions this session asked" };
  }

  // The session is over once it has its three answers: a further answer is not a turn.
  if (parsed.text !== null && parsed.answers.length >= QUESTIONS_PER_SESSION) {
    return { status: "invalid", reason: "the session already has all of its answers" };
  }

  const answers: InterviewAnswer[] = [...parsed.answers];

  if (parsed.text !== null) {
    // The words become an answer and nothing more. No instruction inside them is acted on.
    answers.push({ questionId: questionForStep(answers.length, deps.adapter).id, text: parsed.text });
  }

  const description = parsed.description ?? "";

  if (answers.length >= QUESTIONS_PER_SESSION) {
    // The region is normalised against the fixed map here: a client that sends an unknown label
    // sends no region at all, so no invented name can reach the card. The description travels with
    // the answers so the card can carry the user's own first account of the sensation.
    const worded = await wordCard(
      { answers, regionLabel: userLocationFrom(parsed.regionLabel), description },
      deps,
    );

    return { status: "complete", card: worded.card, usedFallback: worded.usedFallback, answers };
  }

  return { status: "asking", question: questionForStep(answers.length, deps.adapter), answers };
}
