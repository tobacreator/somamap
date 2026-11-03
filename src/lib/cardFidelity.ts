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
 *   - the location is the user's own words (`userLocationFrom`, Phase 2H): the label they tapped on the
 *     fixed map (`src/lib/regions.ts`) or anything they typed into the location field, kept as written.
 *     A model's location is discarded, and an empty field means no location, never a guess. The fixed
 *     map remains the map's own vocabulary - it is what the tap targets are called - but it no longer
 *     decides what a person is allowed to say about where they feel something;
 *   - `user_own_sentence` is the description the user wrote first, when they wrote one, and otherwise
 *     one of their answers - quoted exactly, in both cases;
 *   - `duration` is the user's own phrase that contains a time expression - located, never invented;
 *   - `quality_words` are words the user actually typed, in the order they typed them, minus the ones
 *     that would only repeat a phrase the card already shows in full;
 *   - `intensity_metaphor` is the user's own comparison (the phrase containing "like"), verbatim;
 *   - a model's draft is **grounded in the session** before it can reach the screen
 *     (`groundModelDraft`, Phase 2A): the region, the duration and the sentence are always the
 *     session's own, and the two rows a model is allowed to word keep only what the user's own words
 *     support;
 *   - a field the session cannot supply is left **empty**, which the card screen already renders as
 *     "Not answered yet" (`src/lib/cardView.ts`) - except `duration`, which the screen hides while
 *     nothing has been collected for it - rather than filled with anything.
 *
 * Nothing here interprets, classifies or scores: the functions only locate and copy. The module is
 * pure - no clock, no randomness, no network - so the same session always produces the same card.
 */

/** The session's own material: the answers given, and the region the client selected. */
export type FidelitySource = {
  answers: readonly { questionId: string; text: string }[];
  /** A label from the fixed map, or absent when the user selected no region. */
  regionLabel?: string;
  /**
   * The optional description the user wrote on the check-in screen, verbatim: their own first account
   * of the sensation, before any question was asked.
   *
   * It reaches the card only through the interview route, and `interviewStep` screens it with the same
   * crisis lexicon it screens an answer with **before** `wordCard` may read it. Nothing here reads it
   * unscreened, and nothing here rewrites it: it is copied whole, or not used at all.
   */
  description?: string;
};

/**
 * The region label, and only from the fixed map. Anything else - an invented label, a model's
 * suggestion, a client's typo - is no region at all. This is the shield's build rule made
 * executable: the region label never comes from model output.
 */
export function regionLabelFrom(value: unknown): string {
  return typeof value === "string" && REGION_LABELS.includes(value) ? value : "";
}

/** The longest location this build will keep, in characters. */
export const USER_LOCATION_MAX_LENGTH = 60;

/**
 * The location the person chose or typed - their own words, kept as they wrote them (Phase 2H).
 *
 * The fixed map is a set of suggestions, not a filter. "left wrist", "jaw" and "the spot under my right
 * shoulder blade" are all legitimate answers, and mapping any of them onto the nearest of the fourteen
 * labels would put words in the person's mouth - the one thing this module exists to prevent. So a
 * label the map does not know is kept, not discarded, and nothing is ever translated.
 *
 * What it does do is make the text safe to carry: control and format characters become a space (so a
 * line break cannot glue two words together and an invisible override cannot hide one), repeated
 * whitespace is collapsed, the ends are trimmed, and the result is capped at `USER_LOCATION_MAX_LENGTH`
 * characters. Capitalisation and the person's own terminology are untouched.
 */
export function userLocationFrom(value: unknown): string {
  if (typeof value !== "string") return "";

  const normalised = value
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalised.slice(0, USER_LOCATION_MAX_LENGTH).trimEnd();
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

/**
 * The single-word time expressions, for membership tests. The list above also carries one phrase
 * ("on and off"), which is matched by substring rather than by word, so the two are kept apart.
 */
const SINGLE_TIME_WORDS = new Set(TIME_WORDS.filter((word) => !word.includes(" ")));

function hasTimeWord(text: string): boolean {
  const lower = text.toLowerCase();

  return TIME_WORDS.some((word) =>
    word.includes(" ") ? lower.includes(word) : new RegExp(`\\b${word}\\b`).test(lower),
  );
}

/**
 * The one entry in the list above that names a *pattern* rather than a length of time. "on and off"
 * says how a sensation behaves, not how long it has been there, so it may never anchor the duration
 * row: an answer that mentions it still has to name a real time before the row can be filled.
 */
const TIME_PATTERNS: readonly string[] = ["on and off"];

/** The expressions that may anchor the row: a time the user named, never a pattern they described. */
const TIME_ANCHORS = TIME_WORDS.filter((word) => !TIME_PATTERNS.includes(word));

/**
 * The anchoring vocabulary as one pattern, longest entry first so a phrase would win over any single
 * word inside it. It only ever *locates* an expression; nothing here invents one.
 */
const TIME_EXPRESSION = new RegExp(
  `\\b(?:${[...TIME_ANCHORS].sort((left, right) => right.length - left.length).join("|")})\\b`,
  "i",
);

/** A clock time: "6 AM", "6am", "18:30", "6 o'clock". */
const CLOCK_TIME = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*o'clock\b/i;

/**
 * Quantities the user may write in front of a time unit. They belong to the expression beside them,
 * so "two weeks" is kept whole rather than reduced to "weeks".
 */
const DURATION_QUANTITIES = new Set([
  "a", "all", "an", "couple", "dozen", "each", "every", "few", "fifty", "forty", "four", "half",
  "hundred", "most", "nine", "one", "seven", "several", "six", "sixty", "some", "ten", "thirty",
  "three", "twelve", "twenty", "two", "whole",
]);

/**
 * Words that qualify a time expression rather than describing the sensation, so they stay with it
 * ("about three days", "since this morning"). Each is kept only when it sits beside a time
 * expression the user actually wrote, so none of them can produce a duration on its own.
 */
const DURATION_QUALIFIERS = new Set([
  "about", "almost", "approximately", "around", "last", "nearly", "next", "over", "past", "roughly",
  "this", "under",
]);

/**
 * The one preposition that introduces a duration without being part of it. `ISS-03` removed a bare
 * "for" as a *trigger*; this correction also keeps it out of the *expression*, so "for two weeks"
 * reads as "two weeks" and "It has been like this for three days." reads as "three days" rather than
 * as the mangled "this for three days". It is listed here only so the rule is visible in one place.
 */
const DURATION_PREPOSITIONS = new Set(["for"]);

/** One word of an answer, with the offsets that let an expression be quoted exactly as written. */
type Word = { text: string; start: number; end: number };

/** The words of a text, in order, with their offsets. Digits count as words: "6 AM" is a time. */
function wordsIn(text: string): Word[] {
  const words: Word[] = [];

  for (const match of text.matchAll(/[A-Za-z][A-Za-z'-]*|\d+/g)) {
    const start = match.index ?? 0;

    words.push({ text: match[0], start, end: start + match[0].length });
  }

  return words;
}

/** Whether a word may sit inside a duration expression, rather than ending it. */
function isDurationToken(word: string): boolean {
  const lower = word.toLowerCase();

  // The preposition is never part of the expression, whatever else a token list may say.
  if (DURATION_PREPOSITIONS.has(lower)) return false;

  return (
    SINGLE_TIME_WORDS.has(lower) ||
    DURATION_QUANTITIES.has(lower) ||
    DURATION_QUALIFIERS.has(lower) ||
    /^\d+$/.test(lower)
  );
}

/** The first time expression in a text, as offsets, or null. Earliest wins; ties go to the longer. */
function firstTimeExpression(text: string): { start: number; end: number } | null {
  const spans = [TIME_EXPRESSION.exec(text), CLOCK_TIME.exec(text)]
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));

  if (spans.length === 0) return null;

  return spans.sort((left, right) => left.start - right.start || right.end - left.end)[0];
}

/**
 * The duration expression inside an answer, or "" when the answer carries none.
 *
 * The row used to hold the whole answer that mentioned time, so "It has been there for about three
 * days now." put that entire sentence under `How long`. It now holds the expression itself - the
 * user's own words, cut out of the sentence and otherwise untouched:
 *
 *   - the anchor is the first time the user named - a unit, a point in time or a clock time - so a
 *     word of theirs always locates the row and nothing is inferred. A pattern ("on and off") is not
 *     a length of time and never anchors it (`TIME_PATTERNS`);
 *   - the expression grows over the words beside it that belong to it - quantities ("two"),
 *     qualifiers ("about", "around", "since", "this") and further time words ("yesterday morning") -
 *     and stops at the first word that does not;
 *   - a word that merely introduces the expression is not part of it, so "for two weeks" is
 *     "two weeks" and "like this for three days" is "three days" (`DURATION_PREPOSITIONS`);
 *   - nothing is added, so the result is always a substring of what the user wrote: a duration can
 *     never be guessed, reworded or invented, and an answer with no time expression yields nothing.
 */
function durationExpressionIn(text: string): string {
  const words = wordsIn(text);
  const expression = firstTimeExpression(text);

  if (expression === null || words.length === 0) return "";

  const first = words.findIndex((word) => word.start >= expression.start);
  let last = words.reduce((index, word, at) => (word.end <= expression.end ? at : index), -1);

  if (first < 0 || last < first) return "";

  while (last + 1 < words.length && isDurationToken(words[last + 1].text)) last += 1;

  let start = first;

  while (start - 1 >= 0 && isDurationToken(words[start - 1].text)) start -= 1;

  return text.slice(words[start].start, words[last].end);
}

/** The answers as the session recorded them: trimmed, non-empty, with the question each one answered. */
function answerEntries(source: FidelitySource): readonly { questionId: string; text: string }[] {
  return source.answers
    .map((answer) => ({ questionId: answer.questionId, text: answer.text.trim() }))
    .filter((answer) => answer.text.length > 0);
}

/**
 * The user's answers as they wrote them: trimmed, non-empty, in order.
 *
 * Exported for the draft guard (Phase 2B), which must decide authorship by the *same* definition the
 * grounding uses - one whole answer of theirs, or one word of theirs - rather than by a looser test of
 * its own. Nothing here changed: the grounding reads it exactly as before.
 */
export function answersWithWords(source: FidelitySource): readonly string[] {
  return answerEntries(source).map((answer) => answer.text);
}

/**
 * Whether a single word may be shown as one of the user's own quality words (`ISS-04`, `ISS-16/C`).
 *
 * Time expressions are excluded here as well as in `quality_words` (`ISS-16/C`): the reviewed
 * `TIME_WORDS` list decides, so "morning", "yesterday" and "week" can no longer appear under "Words
 * you chose" merely because they were typed. Only the time word itself is removed - a descriptive word
 * standing next to it ("a heavy band all week" keeps "heavy" and "band") is not.
 */
function isQualityWord(lower: string): boolean {
  if (lower.length < 3) return false;
  if (NON_QUALITY_WORDS.has(lower)) return false;
  if (FILLER_WORDS.has(lower)) return false;
  if (SINGLE_TIME_WORDS.has(lower)) return false;

  return true;
}

/** The phrases that state a resemblance outright. */
const COMPARISON_MARKERS: readonly RegExp[] = [
  /\blike\b/i,
  /\bas if\b/i,
  /\bas though\b/i,
  /\bsimilar to\b/i,
  /\breminds? me of\b/i,
];

/**
 * Words that turn an answer into a statement about *not knowing* rather than a comparison. They
 * disqualify an answer from `intensity_metaphor` unless it also states a resemblance outright.
 *
 * The list is a rejection list: it can only ever leave the metaphor row unanswered, never put a
 * comparison on the card that the user did not make. That is the direction `ISS-16/D` asks for -
 * "when uncertain, leave the field unanswered rather than manufacture a comparison".
 */
const NON_COMPARISON_WORDS = new Set([
  "not", "no", "never", "none", "nothing", "know", "knows", "knew", "known",
  "sure", "unsure", "maybe", "perhaps", "guess", "cannot", "cant", "dont", "didnt", "doesnt", "isnt", "wasnt",
]);

/**
 * Whether an answer is genuinely comparison-shaped, and so may be shown as `intensity_metaphor`
 * (`ISS-16/D`).
 *
 * The test is conservative on purpose, and the answer's own content decides - never the question it
 * answered:
 *
 *   - a **marker** ("like", "as if", "similar to", "reminds me of") states a resemblance: accepted;
 *   - otherwise the answer must still **describe** something - at least one word that survives the
 *     quality filter - must not be a statement about not knowing, and must not be a time phrase;
 *   - and it must carry **at least three words** (correction 4, after the owner's UAT). A stated
 *     resemblance is a resemblance whatever its length, but a bare two-word phrase is neither a
 *     comparison nor a description: "big bang" reached this row in the owner's session, and the pair
 *     of words was all it took. From three words on there is enough structure to describe something
 *     ("A heavy blanket resting on my chest"), which is what keeps the comparison question useful
 *     (`ISS-02`).
 *
 * Measured against the owner's own examples: "Like a scarf knotted too tight" is accepted; "Maybe",
 * "Since this morning", "All week" and "big bang" are all refused. "A heavy blanket resting on my
 * chest" is accepted, because it is a description rather than a time or an uncertainty.
 *
 * Unusual or unfamiliar wording is never refused for being unusual: every refusal above comes from
 * what the answer *lacks* - a resemblance, a description, a time expression, a denial of knowing -
 * and never from the words looking strange. The list is a rejection list, so the worst it can do is
 * leave the row unanswered.
 *
 * `ownFields` applies this in one place and nowhere else: to the **comparison question's** answer,
 * before it may stand as the metaphor. An answer to any other question is never taken this way.
 */
export function isComparisonShaped(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length === 0) return false;

  const words = trimmed.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];

  // A single word is never a comparison: "Maybe" is the owner's example.
  if (words.length < 2) return false;

  if (COMPARISON_MARKERS.some((marker) => marker.test(trimmed))) return true;

  // A stated resemblance is a resemblance whatever its length, but a bare two-word phrase is not a
  // comparison and describes nothing: correction 4, after "big bang" reached this row in the owner's
  // UAT. Three words is the floor at which a phrase can describe something.
  if (words.length < 3) return false;

  const lower = words.map((word) => word.toLowerCase());

  if (lower.some((word) => NON_COMPARISON_WORDS.has(word))) return false;
  if (hasTimeWord(trimmed)) return false;

  return lower.some((word) => isQualityWord(word));
}

/** The fields the session's own material decides, before the region is applied. */
type OwnFields = { duration: string; metaphor: string; sentence: string };

/** The longest text in a pool, or "" when the pool is empty. Never rewrites anything. */
function longest(pool: readonly string[]): string {
  return pool.reduce((best, text) => (text.length > best.length ? text : best), "");
}

/**
 * The session's own material, resolved once.
 *
 * Three rules, each an owner-approved fidelity decision:
 *
 *   - **the duration** (`ISS-16/E`) is the first answer that carries a time expression **from a
 *     question that was not asking for a comparison**. The comparison question's answer is never read
 *     as a duration, because the card must not imply the user supplied information in response to a
 *     different question;
 *   - **the metaphor** (`ISS-16/D`) is the first answer that is genuinely comparison-shaped, and never
 *     the answer the duration already used: one answer does not fill two rows;
 *   - **the sentence** (`ISS-16/B`, correction 1) is the description the user wrote on the check-in
 *     screen whenever there is one - **always**, however short it is and however long the answers
 *     are, because it is the user's own first account of the sensation and nothing may displace it.
 *     Only with no description does the old rule apply: the longest user-owned text that is neither
 *     the duration nor the metaphor. When nothing distinct is left, the sentence is empty and the card
 *     screen renders "Not answered yet": a repeated row is worse than an honest blank, and nothing is
 *     ever rewritten to fill one.
 *
 * `metaphorTaken` says whether the card being built will actually show the user's comparison in
 * `intensity_metaphor`. When it will, the sentence must not repeat it; when the card renders the
 * reviewed fallback's own metaphor instead, nothing is taken and nothing is excluded.
 */
function ownFields(source: FidelitySource, metaphorTaken: boolean): OwnFields {
  const entries = answerEntries(source);

  /**
   * The answer the duration came from, and the expression inside it. `How long` holds the expression -
   * the user's own words, cut out of the sentence - rather than the whole answer.
   */
  const durationEntry = entries.find(
    (entry) => entry.questionId !== COMPARISON_QUESTION_ID && durationExpressionIn(entry.text).length > 0,
  );
  const duration = durationEntry === undefined ? "" : durationExpressionIn(durationEntry.text);

  /**
   * The comparison, in two steps (`ISS-16/D`):
   *
   *   1. an answer that states a resemblance outright - a marker such as "like ..." - wherever it was
   *      said. That is the user's own comparison, and it stays first because a phrase the user built as
   *      a comparison is the most reliable signal there is;
   *   2. failing that, the answer to the **comparison question**, and only when that answer is itself
   *      genuinely comparison-shaped: a descriptive reply to a question that asked for a comparison is
   *      one, while "Maybe", "Since this morning" and "All week" are not.
   *
   * An answer to any **other** question is never taken, however descriptive it is: it answers the
   * question it was asked, and presenting it as a comparison would be exactly the mislabelling
   * `ISS-16/E` forbids.
   */
  const stated = entries.find((entry) => COMPARISON_MARKERS.some((marker) => marker.test(entry.text)));
  const answered = entries.find((entry) => entry.questionId === COMPARISON_QUESTION_ID);
  const comparison = stated ?? (answered !== undefined && isComparisonShaped(answered.text) ? answered : undefined);
  const candidate = comparison?.text ?? "";

  /**
   * One answer does not fill two rows (`ISS-16/E`), and the rule is about the **answer**, not about the
   * text: now that `How long` holds an expression rather than the whole answer, comparing the two
   * *values* would let the answer that supplied the duration fill the comparison row as well.
   */
  const metaphor = metaphorTaken && comparison !== durationEntry ? candidate : "";

  /**
   * The description always takes the sentence row when the user wrote one (correction 1, after the
   * owner's UAT). It is copied whole - trimmed, never merged with an answer, never reworded,
   * re-punctuated or "improved" - and no answer can displace it, however long that answer is. It can
   * never collide with the duration or the comparison, because neither is ever read from the
   * description: both come from the answers alone.
   *
   * With no description, the rule is unchanged: the longest eligible answer.
   */
  const description = (source.description ?? "").trim();
  const pool = [description, ...entries.map((entry) => entry.text)].filter((text) => text.length > 0);
  const taken = new Set([duration, metaphor].filter((text) => text.length > 0));
  const sentence = description.length > 0 ? description : longest(pool.filter((text) => !taken.has(text)));

  return { duration, metaphor, sentence };
}

/**
 * The three fields the session itself can always supply, quoted exactly. Empty strings mean "the
 * user did not say", which the card screen renders as "Not answered yet" - never a substitute.
 *
 * This is the view of the session's material for a card that is **not** the mock's: the reviewed
 * fallback keeps its own `intensity_metaphor` copy, so the user's comparison is not taken from the
 * sentence here.
 */
export function userOwnFields(source: FidelitySource): {
  location_label: string;
  duration: string;
  user_own_sentence: string;
} {
  const own = ownFields(source, false);

  return {
    location_label: userLocationFrom(source.regionLabel),
    duration: own.duration,
    user_own_sentence: own.sentence,
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

/**
 * Whether a word list is exactly the words of a phrase: every word the phrase holds, and nothing
 * else. Used to recognise a vocabulary row that merely repeats a phrase the card already shows in
 * full, which is the one case where the row is left unanswered rather than shortened.
 */
function reproduces(words: readonly string[], phrase: string): boolean {
  if (words.length === 0 || phrase.length === 0) return false;

  const phraseWords = (phrase.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).map((word) => word.toLowerCase());
  const chosen = new Set(words.map((word) => word.toLowerCase()));

  return phraseWords.length === chosen.size && phraseWords.every((word) => chosen.has(word));
}

/**
 * The words the user actually typed, in order, deduplicated, at most five.
 *
 * Two sources, answers first (`ISS-16/A`): the answers, then the description the user wrote before any
 * question was asked. The answers come first so the words chosen in response to a question about the
 * sensation keep their place under "Words you chose"; a long description can only fill what is left.
 *
 * The filter itself is `isQualityWord`, so a time expression is never presented as a quality word
 * (`ISS-16/C`) and a descriptive word next to one is never removed with it.
 *
 * Correction 3, after the owner's UAT, adds two exclusions. Both are about the row adding no
 * vocabulary the card does not already show; neither is about a word looking unusual, and neither
 * reinterprets what the user said:
 *
 *   - a word is dropped when **every** text it came from is the phrase shown verbatim under
 *     `It feels like`. That is what removes "big" and "bang" when the user's whole answer was
 *     "big bang": the pair only repeated the row above it. A word that also came from another answer
 *     ("tight" in "tight and heavy") is not dropped, because that answer is nowhere else on the card;
 *   - the row is left empty when the words that remain are exactly the words of `It feels like` or of
 *     `In your words` - the list reproduces a phrase the card shows in full, so it adds nothing.
 *
 * Nothing is invented to replace what goes, and the cap still holds: the row may simply hold fewer
 * words, which is the preference the owner set - fewer accurate words over five questionable ones.
 * The user's words are never lost, because the row that quotes them keeps them verbatim.
 */
function qualityWordsFrom(source: FidelitySource, own: OwnFields): string[] {
  const words: string[] = [];
  const texts = [...answersWithWords(source), (source.description ?? "").trim()];
  /** Every text each word came from, so a word's sources can be judged as a whole. */
  const cameFrom = new Map<string, string[]>();

  for (const text of texts) {
    for (const match of text.matchAll(/[A-Za-z][A-Za-z'-]*/g)) {
      const word = match[0];
      const lower = word.toLowerCase();

      if (!isQualityWord(lower)) continue;

      const seen = cameFrom.get(lower) ?? [];
      if (!seen.includes(text)) seen.push(text);
      cameFrom.set(lower, seen);

      // The cap is on the row, not on the reading: every text is still scanned above, so a word's
      // sources are complete even once five words are held.
      if (words.length === 5) continue;
      if (words.some((already) => already.toLowerCase() === lower)) continue;

      words.push(word);
    }
  }

  const kept = words.filter((word) => {
    const from = cameFrom.get(word.toLowerCase()) ?? [];

    // Dropped only when the comparison row is *all* this word ever was.
    return from.length === 0 || from.some((text) => text !== own.metaphor);
  });

  return reproduces(kept, own.metaphor) || reproduces(kept, own.sentence) ? [] : kept;
}

/**
 * The mock's card: derived from the session, never a constant. Mock mode has no provider, so it
 * cannot word anything - it copies what the session supplied and leaves the rest empty. That is what
 * makes the demo path honest, and it is the same contract a live model has to satisfy.
 *
 * Every one of the five fields now comes from the session's own material, resolved once by
 * `ownFields`: the region from the fixed map, the words from the answers and the description, and the
 * three whole-text rows from the rules documented there. Nothing is inferred from a keyword alone, and
 * no answer fills two rows.
 *
 * The words are read *after* the rows are resolved, because what the card shows decides what the
 * vocabulary row may add: a word that only repeats the phrase now sitting under `It feels like` is not
 * shown again as a word the user chose (correction 3).
 */
export function mockCardFrom(source: FidelitySource): SensationCard {
  const own = ownFields(source, true);

  return {
    location_label: userLocationFrom(source.regionLabel),
    quality_words: qualityWordsFrom(source, own),
    intensity_metaphor: own.metaphor,
    duration: own.duration,
    user_own_sentence: own.sentence,
  };
}

/**
 * The card as it must reach the screen: the region the user selected always wins over anything a
 * model drafted, because the region label is the one card field the product can guarantee and it
 * comes from the fixed map. When no region was selected, the draft is left as it is - there is
 * nothing to preserve.
 */
export function preserveUserSelection(card: SensationCard, source: FidelitySource): SensationCard {
  const label = userLocationFrom(source.regionLabel);

  return label.length > 0 ? { ...card, location_label: label } : card;
}

/**
 * The reviewed fallback, made faithful: its placeholders stand for "the region the user tapped, the
 * duration, the user's own words" (see `src/lib/schema.ts`), and the session's real values take their
 * place. The reviewed `quality_words` and `intensity_metaphor` copy stays, because those two are the
 * blueprint's approved fallback wording rather than a claim about the user.
 *
 * Because the metaphor row here keeps the reviewed copy rather than the user's comparison, the
 * sentence is chosen **without** excluding the user's comparison text: nothing on this card repeats,
 * so nothing needs to be held back (`ISS-16/B`).
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

/**
 * The user's own vocabulary, lower-cased: every word the session's answers and description actually
 * contain. The pool is the same one `qualityWordsFrom` reads, so "the user's word" has one meaning
 * on this card rather than two.
 *
 * Exported for the draft guard (Phase 2B) for the same reason: a word is the user's by exactly this
 * test and by no other. Nothing here changed.
 */
export function userVocabulary(source: FidelitySource): Set<string> {
  const tokens = new Set<string>();
  const texts = [...answersWithWords(source), (source.description ?? "").trim()];

  for (const text of texts) {
    for (const match of text.matchAll(/[A-Za-z][A-Za-z'-]*/g)) tokens.add(match[0].toLowerCase());
  }

  return tokens;
}

/**
 * The model's vocabulary selection, kept only where the user actually typed the word (Phase 2A).
 *
 * A word survives when the session's own text contains it, so a synonym, a re-description or a word
 * out of the model's own vocabulary is discarded rather than shown as the user's. The order is the
 * model's - selecting and organising the user's words is the one thing it is allowed to do - and a
 * word is shown once. When nothing the model supplied is the user's, the session's own words stand in
 * (`qualityWordsFrom`), because a card is never emptier than the session that produced it; either
 * way, **every word in the row is a word the user typed**.
 */
function groundedQualityWords(words: readonly string[], source: FidelitySource, own: OwnFields): string[] {
  const vocabulary = userVocabulary(source);
  const kept: string[] = [];

  for (const word of words) {
    const trimmed = word.trim();
    const lower = trimmed.toLowerCase();

    if (trimmed.length === 0 || !vocabulary.has(lower)) continue;
    if (kept.some((already) => already.toLowerCase() === lower)) continue;
    if (kept.length === 5) continue;

    kept.push(trimmed);
  }

  return kept.length > 0 ? kept : qualityWordsFrom(source, own);
}

/**
 * The model's comparison, kept only when it is the user's own (Phase 2A).
 *
 * "Acceptable" means all three: it is comparison-shaped by the reviewed test (`isComparisonShaped`),
 * it appears verbatim in one of the user's answers, and it is not the phrase the card's sentence row
 * will quote - the same phrase in two rows is the defect `ISS-05` fixed. Anything else is discarded
 * and the session's own comparison stands in; the row is empty when the session made none.
 *
 * The pool is the **answers**, not the description, and that is not a style choice: the description
 * always takes the sentence row when the user wrote one (`ISS-16/B`), so a comparison taken from it
 * would be shown twice on the same card. `ownFields` reads the comparison from the answers alone for
 * the same reason, and a model may not introduce the source the card's own rules exclude.
 */
function groundedMetaphor(candidate: string, source: FidelitySource, own: OwnFields): string {
  const trimmed = candidate.trim();
  const said = answersWithWords(source);
  const isTheUsersOwn =
    trimmed.length > 0 && isComparisonShaped(trimmed) && said.some((text) => text.includes(trimmed));

  return isTheUsersOwn && trimmed !== own.sentence ? trimmed : own.metaphor;
}

/**
 * The card as it must reach the screen from a **model's draft** (Phase 2A).
 *
 * The draft is untrusted: it may carry anything a provider produced. Every field the session owns is
 * therefore the session's own, and the two fields a model is allowed to word are kept only where the
 * user's own words support them:
 *
 *   - `location_label` is always the label from the fixed geometric map, and empty when the user
 *     selected no region - a label the model drafted is discarded either way;
 *   - `duration` is the session's own phrase carrying a time expression, and empty when the session
 *     has none; a duration the model drafted is discarded;
 *   - `user_own_sentence` is the description the user wrote first, quoted whole, or the session's
 *     approved selection from the answers; a sentence the model drafted is discarded;
 *   - `quality_words` and `intensity_metaphor` are the model's selection, grounded as above.
 *
 * Nothing here rewrites, merges, embellishes or invents. The function is **idempotent** on
 * `mockCardFrom`'s output - every value it is handed there is already the session's own - which is
 * what keeps mock mode byte-identical, and a test asserts exactly that.
 */
export function groundModelDraft(card: SensationCard, source: FidelitySource): SensationCard {
  const own = ownFields(source, true);

  return {
    location_label: userLocationFrom(source.regionLabel),
    quality_words: groundedQualityWords(card.quality_words, source, own),
    intensity_metaphor: groundedMetaphor(card.intensity_metaphor, source, own),
    duration: own.duration,
    user_own_sentence: own.sentence,
  };
}
