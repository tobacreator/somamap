import { basetenAdapter, defaultBasetenTransport, resolveBasetenConfig, type BasetenTransport } from "./baseten.ts";
import { prohibitedLanguageIn } from "./draftGuard.ts";
import { groundModelDraft, mockCardFrom, withFallbackFidelity } from "./cardFidelity.ts";
import { interviewFixture } from "./fixtures.ts";
import { FALLBACK_CARD, sensationCardSchema, type SensationCard } from "./schema.ts";

/**
 * The model boundary - blueprint Chapter 4.3 (mock mode) and Table 10 (the fail-closed
 * stages).
 *
 * Every model-shaped value passes through this file. The adapter resolves from the
 * recorded fixtures in modal/fixtures/ when MODEL_MODE=mock, and from the live provider
 * when MODEL_MODE=live. This build has no live provider, so live mode fails closed: a draft
 * that cannot be produced or validated renders the reviewed fallback card and the turn still
 * completes. Nothing here calls any service.
 *
 * Crisis is not decided here, and cannot be. The shield is iron rule 4, it lives in
 * `src/lib/crisis.ts`, and `interviewStep` applies it to the user's own text before anything is
 * worded. The adapter has no say in it, which is why a provider that is down, slow, throwing or
 * absent can never show a user the crisis screen (Phase 2C).
 *
 * The boundary is asynchronous (Phase 1, the async foundation). `interview` returns a
 * promise and `wordCard` awaits it, because the only honest way to reach a live provider is
 * a network call, and the waiting belongs here rather than in a caller. Mock mode resolves
 * immediately, and a rejected promise takes the same fail-closed path as a thrown error, so
 * a caller still has one shape to handle and the reviewed fallback card is still the only
 * outcome of a provider that cannot answer.
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
export type ModelSnapshot = {
  answers: readonly ModelAnswer[];
  /**
   * The location the person chose or typed (Phase 2H), kept as written, or absent when they named none.
   * It travels because the card's `location_label` is the one field the product can guarantee, and it is
   * the session's own words rather than a model's: the fixed map is only where a tap gets its name from.
   */
  regionLabel?: string;
  /**
   * The description the user wrote on the check-in screen, if any (`ISS-16/A`). It reaches this
   * boundary only from `interviewStep`, which has already screened it for crisis with the same lexicon
   * it screens an answer with, so nothing here can receive unscreened initial text.
   */
  description?: string;
};

/**
 * The adapter: the question sequence it wants asked, and the draft it words from the session. The
 * blueprint's other two calls, render and voice, belong to later gates and are deliberately absent
 * rather than stubbed.
 *
 * There is deliberately **no crisis member** (Phase 2C). A provider must not be able to decide,
 * prevent or fake the shield, so that decision belongs to `interviewStep` and the local lexicon alone.
 */
export type ModelAdapter = {
  /** The question ids this adapter wants asked, in order, or null when it cannot choose. */
  questionSequence(): readonly string[] | null;
  /**
   * A draft card as the provider shaped it: untrusted, unvalidated, model-shaped.
   *
   * Asynchronous because a live provider can only be reached by a network call, and this is the
   * one boundary allowed to wait for one. Mock mode returns an already-resolved promise, so no
   * caller has two shapes to handle.
   */
  interview(snapshot: ModelSnapshot): Promise<unknown>;
};

/** Raised when a call cannot be made at all, so the caller can fail closed. */
export class ModelUnavailableError extends Error {
  constructor() {
    super("no live provider is configured in this build");
    this.name = "ModelUnavailableError";
  }
}

/**
 * Mock mode: the recorded question sequence, and a card that is **derived from the session** rather
 * than replayed.
 *
 * The sequence is a recording on purpose - it stands in for a provider's answer and it is what the
 * red-team rows exercise. The card cannot be a recording: a canned card would show the user words they
 * never said, which is exactly what the owner's manual test caught (BUILD-REPORT.md Entry 42). So mock
 * mode copies what the session supplied, and leaves a field empty when the user did not fill it.
 *
 * The crisis shield is not here (Phase 2C): `interviewStep` applies the local lexicon to the user's own
 * text before this adapter is reached at all, so mock mode and live mode screen identically.
 */
export const mockAdapter: ModelAdapter = {
  questionSequence() {
    return interviewFixture.question_ids;
  },
  async interview(snapshot) {
    return mockCardFrom(snapshot);
  },
};

/**
 * Live mode without a provider: the wording fails closed, and the interview still asks the reviewed
 * questions.
 *
 * `interview` throws, so `wordCard` renders the reviewed fallback card - the user's own words, never a
 * crisis screen. `questionSequence` returns the **reviewed** ids rather than null, because the sequence
 * is a product decision and not a provider one: with null, `questionForStep` would fall back to the
 * bank's first question on every step and ask the same question three times.
 */
export const unavailableAdapter: ModelAdapter = {
  questionSequence() {
    return interviewFixture.question_ids;
  },
  async interview() {
    throw new ModelUnavailableError();
  },
};

/**
 * The adapter for the configured mode (Phase 2F).
 *
 * Mock mode is the default and always the fixture-backed adapter: it makes no request, and nothing in
 * this build can make it make one.
 *
 * Live mode gets the Baseten adapter **only when the provider configuration resolves** - a key, an
 * https Baseten URL, a model id and a sane timeout. Anything else (no key, a URL that is not Baseten's,
 * a nonsense timeout) returns the adapter that refuses every call, so live mode fails closed exactly as
 * it did before an adapter existed. The resolution is a category, never a value: a refusal cannot echo
 * the key, the URL or anything else it was handed.
 *
 * `env` and `transport` are injectable so that every path can be tested without a network and without a
 * key; production passes neither.
 */
export function adapterFor(
  mode: ModelMode,
  env: Record<string, string | undefined> = process.env,
  transport: BasetenTransport = defaultBasetenTransport,
): ModelAdapter {
  if (mode !== "live") return mockAdapter;

  const resolution = resolveBasetenConfig(env);

  return resolution.ok ? basetenAdapter({ config: resolution.config, transport }) : unavailableAdapter;
}

/** Why a draft was refused, in the vocabulary the server records. */
export type ViolationReason =
  | "unrecognized_keys"
  | "shape"
  | "provider-unavailable"
  | "prohibited-language"
  | "internal-error";

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

/**
 * The record for a turn that could not be produced at all - an exception the boundary did not
 * anticipate. Categories only, never content: no user text, no model text, no secret, and no reason to
 * mistake it for a crisis.
 */
export function internalErrorRecord(mode: ModelMode): ViolationRecord {
  return { event: "model-output-rejected", reason: "internal-error", keys: [], questions: [], mode };
}

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
 *   - a valid draft is **grounded in the session** before it can reach the screen
 *     (`groundModelDraft`, Phase 2A): `location_label` always comes from the fixed map, `duration`
 *     and `user_own_sentence` are always the session's own, and `quality_words` / `intensity_metaphor`
 *     keep only what the user's own words support;
 *   - the reviewed fallback additionally receives the user's own sentence and duration, which its
 *     placeholders stand for, so a fallback card is never emptier than the session that produced it.
 *
 * Asynchronous because the adapter is: the draft is awaited here, and a rejected promise is
 * caught by the same `catch` a thrown error reaches, so a provider that cannot answer and a
 * provider that answers badly end in exactly the same place.
 */
export async function wordCard(snapshot: ModelSnapshot, deps: WordCardDeps): Promise<WordedCard> {
  let payload: unknown;

  try {
    payload = await deps.adapter.interview(snapshot);
  } catch {
    deps.logger(recordFor("provider-unavailable", [], snapshot, deps.mode));
    return { card: withFallbackFidelity(FALLBACK_CARD, snapshot), usedFallback: true };
  }

  const validation = validateDraftCard(payload);

  if (validation.ok) {
    /**
     * Phase 2B: a draft carrying a recommendation, an interpretation, a cause or a medical claim is
     * refused **whole** - nothing is salvaged from it - and the reviewed fallback renders instead. The
     * guard inspects only the two fields a model is allowed to word, because the other three are the
     * session's own by the time a card is built (`draftGuard.ts`).
     */
    const prohibited = prohibitedLanguageIn(validation.card, snapshot);

    if (prohibited.length > 0) {
      deps.logger(recordFor("prohibited-language", prohibited, snapshot, deps.mode));
      return { card: withFallbackFidelity(FALLBACK_CARD, snapshot), usedFallback: true };
    }

    return { card: groundModelDraft(validation.card, snapshot), usedFallback: false };
  }

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

