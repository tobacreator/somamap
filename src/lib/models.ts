import { mockCardFrom, preserveUserSelection, withFallbackFidelity } from "./cardFidelity.ts";
import { matchedCrisisPhrase, normaliseForMatch } from "./crisis.ts";
import { interviewFixture, prescreenFixture } from "./fixtures.ts";
import { FALLBACK_CARD, sensationCardSchema, type SensationCard } from "./schema.ts";

/**
 * The model boundary - blueprint Chapter 4.3 (mock mode) and Table 10 (the fail-closed
 * stages).
 *
 * Every model-shaped value passes through this file. The adapter resolves from the
 * recorded fixtures in modal/fixtures/ when MODEL_MODE=mock, and from the live provider
 * when MODEL_MODE=live. This build has no live provider, so live mode fails closed
 * exactly as Table 10's last column requires: a prescreen failure sends the caller to the
 * crisis screen instead of passing text through, and a draft that cannot be produced or
 * validated renders the reviewed fallback card. Nothing here calls any service.
 *
 * The strict five-field schema is the only door into a card. A draft carrying anything the
 * schema does not declare - a possible_cause, a recommendation, any sixth key at all - is
 * refused outright and the fallback renders instead. That is iron rule 1's runtime layer,
 * and it is why a model cannot steer the user with text no card field can hold.
 *
 * Refused output is recorded server-side as a category, never as content: the record
 * carries the offending key NAMES, the question ids and the mode. The user's words and
 * the model's text are never logged, and no credential is read or written here.
 */

export type ModelMode = "mock" | "live";

/** The one flag that switches modes: anything other than an explicit "live" is mock. */
export function modelMode(env: Record<string, string | undefined> = process.env): ModelMode {
  return env.MODEL_MODE === "live" ? "live" : "mock";
}

/** One answer as the client sent it: the question it answered, and the words. */
export type ModelAnswer = { questionId: string; text: string };

/**
 * What the interview stage is asked to word a draft from: the answers given, and the region the user
 * selected - a label from the fixed map, or absent when they selected none. The region travels
 * because the card's `location_label` is the one field the product can guarantee, and it comes from
 * the fixed map rather than from a model.
 */
export type ModelSnapshot = { answers: readonly ModelAnswer[]; regionLabel?: string };

/** What the prescreen stage decided, and which layer decided it (Table 10, stage 1). */
export type PrescreenResult = {
  crisis: boolean;
  source: "lexicon" | "classifier" | "provider-unavailable";
};

/**
 * The adapter. This task implements the two calls its checks need - prescreen and
 * interview - plus the question sequence. The blueprint's other two calls, render and
 * voice, belong to later gates and are deliberately absent rather than stubbed.
 */
export type ModelAdapter = {
  prescreen(text: string): PrescreenResult;
  /** The question ids this adapter wants asked, in order, or null when it cannot choose. */
  questionSequence(): readonly string[] | null;
  /** A draft card as the provider shaped it: untrusted, unvalidated, model-shaped. */
  interview(snapshot: ModelSnapshot): unknown;
};

/** Raised when a call cannot be made at all, so the caller can fail closed. */
export class ModelUnavailableError extends Error {
  constructor() {
    super("no live provider is configured in this build");
    this.name = "ModelUnavailableError";
  }
}

/**
 * Mock mode: the recorded fixtures for the prescreen and the question sequence, and a card that is
 * **derived from the session** rather than replayed.
 *
 * The prescreen and the sequence are recordings on purpose - they stand in for a provider's answers
 * and they are what the red-team rows exercise. The card cannot be a recording: a canned card would
 * show the user words they never said, which is exactly what the owner's manual test caught
 * (BUILD-REPORT.md Entry 42). So mock mode copies what the session supplied, and leaves a field empty
 * when the user did not fill it.
 */
export const mockAdapter: ModelAdapter = {
  prescreen(text) {
    if (matchedCrisisPhrase(text) !== null) return { crisis: true, source: "lexicon" };

    const needle = normaliseForMatch(text);
    const recorded = prescreenFixture.recorded.find((row) => normaliseForMatch(row.input) === needle);

    return { crisis: recorded?.crisis ?? prescreenFixture.default_crisis, source: "classifier" };
  },
  questionSequence() {
    return interviewFixture.question_ids;
  },
  interview(snapshot) {
    return mockCardFrom(snapshot);
  },
};

/** Live mode without a provider: every call fails closed. */
export const unavailableAdapter: ModelAdapter = {
  prescreen() {
    return { crisis: true, source: "provider-unavailable" };
  },
  questionSequence() {
    return null;
  },
  interview() {
    throw new ModelUnavailableError();
  },
};

/** The adapter for the configured mode. */
export function adapterFor(mode: ModelMode): ModelAdapter {
  return mode === "live" ? unavailableAdapter : mockAdapter;
}

/** Why a draft was refused, in the vocabulary the server records. */
export type ViolationReason = "unrecognized_keys" | "shape" | "provider-unavailable";

/** The safe record: categories and ids only, never the user's words or the model's text. */
export type ViolationRecord = {
  event: "model-output-rejected";
  reason: ViolationReason;
  /** The key names that were not allowed. Names only - never their values. */
  keys: readonly string[];
  /** Which questions the session had reached. Ids only. */
  questions: readonly string[];
  mode: ModelMode;
};

export type ViolationLogger = (record: ViolationRecord) => void;

/** The server-side record: one line, no content, safe to keep. */
export const consoleViolationLogger: ViolationLogger = (record) => {
  console.warn(`SomaMap model boundary: ${JSON.stringify(record)}`);
};

function recordFor(
  reason: ViolationReason,
  keys: readonly string[],
  snapshot: ModelSnapshot,
  mode: ModelMode,
): ViolationRecord {
  return {
    event: "model-output-rejected",
    reason,
    keys: [...keys],
    questions: snapshot.answers.map((answer) => answer.questionId),
    mode,
  };
}

/** The result of pushing a draft through the strict schema. */
export type DraftValidation =
  | { ok: true; card: SensationCard }
  | { ok: false; reason: "unrecognized_keys"; keys: readonly string[] }
  | { ok: false; reason: "shape" };

/**
 * The only door into a card. A draft that declares the five fields passes; a draft with
 * any sixth key is refused and the offending key names are reported; anything else that
 * is not a card at all is refused as a shape problem. Values are never inspected, so the
 * user's own words can never be the reason a card is refused.
 */
export function validateDraftCard(payload: unknown): DraftValidation {
  const parsed = sensationCardSchema.safeParse(payload);

  if (parsed.success) return { ok: true, card: parsed.data };

  const keys = parsed.error.issues.flatMap((issue) => (issue.code === "unrecognized_keys" ? issue.keys : []));

  return keys.length > 0 ? { ok: false, reason: "unrecognized_keys", keys } : { ok: false, reason: "shape" };
}

/** A card ready to render, and whether the reviewed fallback stood in for the draft. */
export type WordedCard = { card: SensationCard; usedFallback: boolean };

export type WordCardDeps = {
  adapter: ModelAdapter;
  logger: ViolationLogger;
  mode: ModelMode;
};

/**
 * Words the card from the model's draft, with both fail-closed paths in one place: a
 * provider that cannot answer and a draft that will not validate both end at the
 * reviewed fallback card, and both leave a safe record on the server.
 *
 * Fidelity is applied here, once, for every path (Entry 42):
 *   - a valid draft keeps its own wording, except that the **region the user selected** replaces
 *     `location_label`, because that label comes from the fixed map and never from a model;
 *   - the reviewed fallback additionally receives the user's own sentence and duration, which its
 *     placeholders stand for, so a fallback card is never emptier than the session that produced it.
 */
export function wordCard(snapshot: ModelSnapshot, deps: WordCardDeps): WordedCard {
  let payload: unknown;

  try {
    payload = deps.adapter.interview(snapshot);
  } catch {
    deps.logger(recordFor("provider-unavailable", [], snapshot, deps.mode));
    return { card: withFallbackFidelity(FALLBACK_CARD, snapshot), usedFallback: true };
  }

  const validation = validateDraftCard(payload);

  if (validation.ok) return { card: preserveUserSelection(validation.card, snapshot), usedFallback: false };

  deps.logger(
    recordFor(
      validation.reason,
      validation.reason === "unrecognized_keys" ? validation.keys : [],
      snapshot,
      deps.mode,
    ),
  );

  return { card: withFallbackFidelity(FALLBACK_CARD, snapshot), usedFallback: true };
}

