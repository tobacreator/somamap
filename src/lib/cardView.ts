import { CARD_FIELD_LABELS, CARD_NOT_ANSWERED, DISCLAIMER_LINE } from "./copy.ts";
import { FALLBACK_CARD, sensationCardSchema, type SensationCard } from "./schema.ts";

/**
 * What the card view shows - blueprint Section 6.1 and the runtime lock in 4.2.
 *
 * One rule decides everything here: the renderer can only display a card that passed the
 * strict five-field schema. A payload carrying anything else is rejected, and the reviewed
 * fallback renders in its place, so a hostile key has no path to the screen. Nothing is
 * generated, nothing is rewritten, and no field is added.
 *
 * Placeholders are never presented as the user's answers. The reviewed fallback carries
 * three placeholder values that stand for text the renderer is meant to substitute (the
 * region the user tapped, the duration, the user's own words); when the substitution has
 * not happened, those rows render as explicitly unanswered instead of printing the
 * placeholder as if the user had said it.
 */

/** The five card fields, in the order Section 6.1 lists them. */
export const CARD_FIELD_ORDER = [
  "location_label",
  "quality_words",
  "intensity_metaphor",
  "duration",
  "user_own_sentence",
] as const satisfies readonly (keyof SensationCard)[];

/** A field name the card view knows how to render. */
export type CardField = (typeof CARD_FIELD_ORDER)[number];

/**
 * The reviewed fallback's placeholder values. They are read from FALLBACK_CARD rather
 * than retyped, so the list cannot drift from the copy it describes.
 */
export const PLACEHOLDER_VALUES: readonly string[] = [
  FALLBACK_CARD.location_label,
  FALLBACK_CARD.duration,
  FALLBACK_CARD.user_own_sentence,
];

/** One rendered row: the label, exactly what the screen shows, and whether it is an answer. */
export type CardRow = {
  field: CardField;
  label: string;
  /** The text the screen displays. Never a placeholder standing in for an answer. */
  display: string;
  answered: boolean;
};

/** What the card view renders: five rows in schema order, plus the fixed line. */
export type CardViewModel = {
  rows: readonly CardRow[];
  /** True when the payload was rejected and the reviewed fallback is rendering instead. */
  usedFallback: boolean;
  disclaimer: string;
};

function rowFor(card: SensationCard, field: CardField): CardRow {
  const raw = card[field];
  const text = (Array.isArray(raw) ? raw.join(", ") : raw).trim();

  if (text.length === 0 || PLACEHOLDER_VALUES.includes(text)) {
    return { field, label: CARD_FIELD_LABELS[field], display: CARD_NOT_ANSWERED, answered: false };
  }

  // Verbatim: the user's own words are displayed as written, never reworded here.
  return { field, label: CARD_FIELD_LABELS[field], display: text, answered: true };
}

/**
 * The card view for a payload that may or may not be a card. The strict schema decides:
 * a valid payload renders as itself, anything else renders as the reviewed fallback.
 */
export function cardViewForPayload(payload: unknown): CardViewModel {
  const parsed = sensationCardSchema.safeParse(payload);

  return {
    rows: CARD_FIELD_ORDER.map((field) => rowFor(parsed.success ? parsed.data : FALLBACK_CARD, field)),
    usedFallback: !parsed.success,
    disclaimer: DISCLAIMER_LINE,
  };
}

/**
 * The rows the card screen actually renders (correction 2, after the owner's UAT).
 *
 * Four of the five rows show "Not answered yet" while their answer has not arrived, because a session
 * can supply all four. The duration row is different: the shipped three questions never ask how long,
 * so that row would carry "Not answered yet" permanently - a missing answer to a question the user was
 * never asked. It is **hidden** instead, until a duration has actually been collected. Nothing is
 * displayed in its place, and nothing else changes: the schema still carries five fields, `rows` still
 * holds all five, and the other four rows keep their explicit unanswered state.
 *
 * The rule is here, in the render model, rather than in the component, so what the screen shows stays
 * decided in one place and can be tested without a browser.
 */
export function displayRows(view: CardViewModel): readonly CardRow[] {
  return view.rows.filter((row) => row.field !== "duration" || row.answered);
}
