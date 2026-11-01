import { REGION_LABELS } from "./regions.ts";
import { COMPARISON_QUESTION_ID } from "./questionBank.ts";
import type { SensationCard } from "./schema.ts";

/**
 * Card fidelity - what a card is allowed to contain (Entry 42, the accuracy fix).
 *
 * The rule this file exists to enforce: **every value on a card is either the user's own words, the
 * region the user selected, or reviewed fallback copy - never a constant standing in for the user.**
 * Before this module existed, mock mode returned a recorded draft card verbatim, so a session could
 * show a sentence the user never typed; the owner reproduced exactly that. These are the rules that
 * make it impossible:
 *
 *   - the region label comes from the fixed geometric map (`src/lib/regions.ts`) and nowhere else -
 *     a client that sends an unknown label sends no region at all;
 *   - `user_own_sentence` is one of the user's answers, quoted exactly;
 *   - `duration` is the user's own phrase that contains a time expression - located, never invented;
 *   - `quality_words` are words the user actually typed, in the order they typed them;
 *   - `intensity_metaphor` is the user's own comparison (the phrase containing "like"), verbatim;
 *   - a field the session cannot supply is left **empty**, which the card screen already renders as
 *     "Not answered yet" (`src/lib/cardView.ts`), rather than filled with anything.
 *
 * Nothing here interprets, classifies or scores: the functions only locate and copy. The module is
 * pure - no clock, no randomness, no network - so the same session always produces the same card.
 */

/** The session's own material: the answers given, and the region the client selected. */
export type FidelitySource = {
  answers: readonly { questionId: string; text: string }[];
  /** A label from the fixed map, or absent when the user selected no region. */
  regionLabel?: string;
};

/**
 * The region label, and only from the fixed map. Anything else - an invented label, a model's
 * suggestion, a client's typo - is no region at all. This is the shield's build rule made
 * executable: the region label never comes from model output.
 */
export function regionLabelFrom(value: unknown): string {
  return typeof value === "string" && REGION_LABELS.includes(value) ? value : "";
}

/**
 * Words that describe no quality of a sensation: articles, pronouns, auxiliaries and the like. They
 * are filtered out of `quality_words` so that row shows words a person would recognise as their own.
 * The filter is presentational - nothing the user said is lost, because `user_own_sentence` keeps
 * their sentence verbatim.
 */
const NON_QUALITY_WORDS = new Set([
  "a", "about", "after", "again", "all", "also", "am", "an", "and", "any", "are", "as", "at",
  "be", "because", "been", "being", "between", "but", "by", "can", "could", "did", "do", "does",
  "down", "during", "felt", "few", "for", "from", "get", "goes", "going", "got", "had", "has",
  "have", "he", "her", "here", "hers", "him", "his", "how", "i", "if", "in", "into", "is", "it",
  "its", "just", "like", "me", "might", "more", "most", "much", "must", "my", "never", "not", "of",
  "off", "on", "only", "or", "other", "our", "out", "over", "own", "same", "she", "should", "since",
  "so", "some", "still", "than", "that", "the", "their", "them", "then", "there", "they", "this",
  "those", "to", "too", "under", "until", "up", "us", "very", "was", "we", "were", "what", "when",
  "where", "which", "while", "who", "why", "will", "with", "would", "you", "your", "yours",
]);

/**
 * Time expressions that mark a phrase as the user's own answer to "how long". They only *locate* the
 * user's phrase; the phrase itself is copied verbatim, so no duration is ever invented.
 *
 * The bare preposition "for" is deliberately **not** in this list (ISS-03). It was, and it made
 * ordinary sentences look like durations: "I am looking for a word for it." and "It has been waiting
 * for it to pass." both landed in the card's `How long` row. Every entry below is a time word or a
 * time unit, so a genuine duration such as "for about three hours" still matches - through "hours".
 */
const TIME_WORDS = [
  "always", "day", "days", "evening", "hour", "hours", "lately", "minute", "minutes",
  "month", "months", "morning", "night", "on and off", "recently", "since", "today", "tonight",
  "week", "weeks", "yesterday",
];

function hasTimeWord(text: string): boolean {
  const lower = text.toLowerCase();

  return TIME_WORDS.some((word) =>
    word.includes(" ") ? lower.includes(word) : new RegExp(`\\b${word}\\b`).test(lower),
  );
}

function answersWithWords(source: FidelitySource): readonly string[] {
  return source.answers.map((answer) => answer.text.trim()).filter((text) => text.length > 0);
}

/**
 * The three fields the session itself can always supply, quoted exactly. Empty strings mean "the
 * user did not say", which the card screen renders as "Not answered yet" - never a substitute.
 */
export function userOwnFields(source: FidelitySource): {
  location_label: string;
  duration: string;
  user_own_sentence: string;
} {
  const answers = answersWithWords(source);
  const longest = (pool: readonly string[]) =>
    pool.reduce((best, text) => (text.length > best.length ? text : best), "");
  const timed = answers.find((text) => hasTimeWord(text));

  /**
   * The sentence quoted on the card: the user's longest answer that is **not already used as the
   * duration** (`ISS-05`), so two rows do not carry the same text. When every answer is the duration
   * - a session with one answer, or one where the user gave a duration each time - the longest answer
   * stands, because a repeated sentence is better than an empty row. The text is never rewritten.
   */
  const distinct = answers.filter((text) => text !== timed);
  const sentence = distinct.length > 0 ? longest(distinct) : longest(answers);

  return {
    location_label: regionLabelFrom(source.regionLabel),
    duration: timed ?? "",
    user_own_sentence: sentence,
  };
}

/**
 * Words that describe no quality of a sensation *and* no place either: numbers and pure
 * function/spatial words. They are filtered out of `quality_words` so that the row shows words a
 * person would recognise as describing how something felt (`ISS-04`).
 *
 * What is deliberately **not** here: anything that can be a quality word. "tight", "heavy", "sharp",
 * "dull", "warm", "aching", "burning", "throbbing", "numb", "pins", "needles", "sore", "stiff",
 * "cramping", "pressure", "tingling", "flutter", "hum", "squeeze", "waves", "steady", "spreading",
 * "deep" and their like all stay. The filter removes filler, never a description.
 *
 * The user's words are not lost by this filter: `user_own_sentence` still quotes one of their
 * answers verbatim, and nothing here rewrites or paraphrases anything.
 */
const FILLER_WORDS = new Set([
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "first", "second", "third", "fourth", "fifth",
  "stay", "stays", "stayed", "staying", "keep", "keeps", "kept",
  "go", "goes", "going", "went", "come", "comes", "coming", "came",
  "get", "gets", "getting", "got", "seem", "seems", "seemed", "look", "looks", "looked",
  "feel", "feels", "feeling",
  "thing", "things", "time", "times", "way", "ways", "kind", "sort", "bit", "lot",
  "something", "anything", "nothing", "everything", "somewhere", "anywhere", "nowhere", "everywhere",
  "here", "there", "where", "when", "around", "about", "across", "along", "through",
  "upper", "lower", "left", "right", "front", "side", "sides", "middle", "top", "bottom",
  "area", "part", "parts", "place", "places", "spot", "spots", "point", "points",
  "really", "quite", "very", "just", "still", "even", "also", "again", "always",
]);

/** The words the user actually typed, in order, deduplicated, at most five. */
function qualityWordsFrom(source: FidelitySource): string[] {
  const words: string[] = [];

  for (const answer of answersWithWords(source)) {
    for (const match of answer.matchAll(/[A-Za-z][A-Za-z'-]*/g)) {
      const word = match[0];
      const lower = word.toLowerCase();

      if (lower.length < 3 || NON_QUALITY_WORDS.has(lower) || FILLER_WORDS.has(lower)) continue;
      if (words.some((seen) => seen.toLowerCase() === lower)) continue;

      words.push(word);

      if (words.length === 5) return words;
    }
  }

  return words;
}

/**
 * The user's own comparison, verbatim, or nothing when they made none.
 *
 * Two sources, in this order (`ISS-02`), and neither is a guess:
 *
 *   1. an answer the user actually phrased as a comparison - "like ..." - wherever they said it. This
 *      is the original, well-tested locator and it stays first, because a phrase the user built as a
 *      comparison is the most reliable signal there is;
 *   2. failing that, the answer to the **comparison question** (Q14, "What does it remind you of?").
 *      That question asks for a comparison, so its answer *is* one - taking it is not inference. It
 *      is a fallback rather than the first choice so that an answer which is plainly something else
 *      (a duration, say) never displaces a comparison the user did make.
 *
 * When the user supplied neither, the field stays empty: nothing is inferred from unrelated answers.
 */
function metaphorFrom(source: FidelitySource): string {
  const stated = answersWithWords(source).find((text) => /\blike\b/i.test(text));

  if (stated) return stated;

  const answered = source.answers.find(
    (answer) => answer.questionId === COMPARISON_QUESTION_ID && answer.text.trim().length > 0,
  );

  return answered ? answered.text.trim() : "";
}

/**
 * The mock's card: derived from the session, never a constant. Mock mode has no provider, so it
 * cannot word anything - it copies what the session supplied and leaves the rest empty. That is what
 * makes the demo path honest, and it is the same contract a live model has to satisfy.
 */
export function mockCardFrom(source: FidelitySource): SensationCard {
  const own = userOwnFields(source);

  return {
    location_label: own.location_label,
    quality_words: qualityWordsFrom(source),
    intensity_metaphor: metaphorFrom(source),
    duration: own.duration,
    user_own_sentence: own.user_own_sentence,
  };
}

/**
 * The card as it must reach the screen: the region the user selected always wins over anything a
 * model drafted, because the region label is the one card field the product can guarantee and it
 * comes from the fixed map. When no region was selected, the draft is left as it is - there is
 * nothing to preserve.
 */
export function preserveUserSelection(card: SensationCard, source: FidelitySource): SensationCard {
  const own = userOwnFields(source);

  return own.location_label.length > 0 ? { ...card, location_label: own.location_label } : card;
}

/**
 * The reviewed fallback, made faithful: its placeholders stand for "the region the user tapped, the
 * duration, the user's own words" (see `src/lib/schema.ts`), and the session's real values take their
 * place. The reviewed `quality_words` and `intensity_metaphor` copy stays, because those two are the
 * blueprint's approved fallback wording rather than a claim about the user.
 */
export function withFallbackFidelity(card: SensationCard, source: FidelitySource): SensationCard {
  const own = userOwnFields(source);
  const withRegion = preserveUserSelection(card, source);

  return {
    ...withRegion,
    duration: own.duration.length > 0 ? own.duration : withRegion.duration,
    user_own_sentence: own.user_own_sentence.length > 0 ? own.user_own_sentence : withRegion.user_own_sentence,
  };
}
