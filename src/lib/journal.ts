import { cardViewForPayload } from "./cardView.ts";
import type { JournalEntry } from "./patterns.ts";
import { FALLBACK_CARD, sensationCardSchema, type SensationCard } from "./schema.ts";

/**
 * The journal's pure half: what a saved card holds, and how a stored row is read back.
 *
 * Nothing here touches a network, a clock or a model. Two rules are the whole of it:
 *
 *   1. **Only the user's own values are ever stored.** A card the renderer presents as unanswered -
 *      because the reviewed fallback stood in for it, or because the session never supplied it - is
 *      stored as empty, never as the fallback's own placeholder text. A fallback card also drops the
 *      two fields a model words (`quality_words`, `intensity_metaphor`), because those hold the
 *      reviewed fallback copy rather than anything the user said, and the journal counts the user's
 *      own chosen words. The user's location and sentence survive that, because they are the session's
 *      own (`withFallbackFidelity`), and they are what the card exists to keep.
 *   2. **A stored row is read back as a card, never as an interpretation.** The five fields travel
 *      unchanged to the renderer, which revalidates them against the strict schema and shows the
 *      reviewed fallback if they do not pass.
 */

/** A card as it is written to `public.cards`: the five schema fields, and nothing else. */
export type SavedCard = SensationCard;

/**
 * True only when the card's two model-worded fields are the reviewed fallback's own pair, untouched.
 *
 * The renderer shows those values on purpose (`schema.ts`: the fallback carries the blueprint's reviewed
 * copy verbatim), but they are the product's words rather than the person's, and the journal counts the
 * person's own vocabulary - so they are not written. The test is on the **pair**: a person whose own
 * words happen to include one of them keeps their words, because the fallback never words a card with
 * its own pair while also keeping a session's own vocabulary.
 */
function carriesReviewedFallbackCopy(card: SensationCard): boolean {
  const metaphor = card.intensity_metaphor.trim();
  const words = card.quality_words.map((word) => word.trim());

  return (
    metaphor === FALLBACK_CARD.intensity_metaphor &&
    words.length === FALLBACK_CARD.quality_words.length &&
    words.every((word, index) => word === FALLBACK_CARD.quality_words[index])
  );
}

/**
 * The card to persist for a payload the route produced, or null when the payload is not a card at all.
 *
 * The strict schema decides first: a payload carrying a sixth key, a wrong type or a sixth quality word
 * is refused outright, so nothing that is not a five-field card can reach the database. Only then are
 * the placeholder rules applied.
 */
export function savedCardFromPayload(payload: unknown): SavedCard | null {
  const parsed = sensationCardSchema.safeParse(payload);

  if (!parsed.success) return null;

  const view = cardViewForPayload(parsed.data);
  const answered = (field: (typeof view.rows)[number]["field"]): boolean =>
    view.rows.find((row) => row.field === field)?.answered === true;
  const fallbackCopy = carriesReviewedFallbackCopy(parsed.data);

  return {
    location_label: answered("location_label") ? parsed.data.location_label : "",
    quality_words: fallbackCopy || !answered("quality_words") ? [] : parsed.data.quality_words,
    intensity_metaphor: fallbackCopy || !answered("intensity_metaphor") ? "" : parsed.data.intensity_metaphor,
    duration: answered("duration") ? parsed.data.duration : "",
    user_own_sentence: answered("user_own_sentence") ? parsed.data.user_own_sentence : "",
  };
}

/** One row of `public.cards` as PostgREST returns it: the five content columns plus bookkeeping. */
export type JournalCardRecord = {
  id: string;
  created_at: string;
  location_label: string;
  quality_words: readonly string[];
  intensity_metaphor: string;
  duration: string;
  user_own_sentence: string;
};

/**
 * True only for a row this build can render: a string id and date, four string fields and the words as
 * an array of strings. Anything else is refused rather than coerced, so a changed column cannot be
 * shown as if it were a card.
 */
export function isJournalCardRecord(value: unknown): value is JournalCardRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  const row = value as Record<string, unknown>;

  if (typeof row.id !== "string" || row.id.length === 0) return false;
  if (typeof row.created_at !== "string" || row.created_at.length === 0) return false;
  if (typeof row.location_label !== "string") return false;
  if (typeof row.intensity_metaphor !== "string") return false;
  if (typeof row.duration !== "string") return false;
  if (typeof row.user_own_sentence !== "string") return false;
  if (!Array.isArray(row.quality_words)) return false;

  return row.quality_words.every((word) => typeof word === "string");
}

/** The five fields of a stored row, in the shape the card renderer validates. */
export function cardPayloadFromRecord(record: JournalCardRecord): SensationCard {
  return {
    location_label: record.location_label,
    quality_words: [...record.quality_words],
    intensity_metaphor: record.intensity_metaphor,
    duration: record.duration,
    user_own_sentence: record.user_own_sentence,
  };
}

/**
 * One stored card as a journal entry, for the vocabulary engine.
 *
 * The four columns are the ones the engine's own type names: the date the card was saved, the place
 * the user named, the words they chose, and their sentence verbatim. Nothing is derived, summarised or
 * reworded - the engine counts and clusters these values and never comments on them.
 */
export function journalEntryFromRecord(record: JournalCardRecord): JournalEntry {
  return {
    date: record.created_at.slice(0, 10),
    region: record.location_label,
    qualityWords: [...record.quality_words],
    ownSentence: record.user_own_sentence,
  };
}
