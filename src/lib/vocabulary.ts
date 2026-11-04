/**
 * Candidate vocabulary - the words a person can borrow when they have none of their own (`ISS-22`).
 *
 * The product's premise is that people often feel something they cannot name. The interview asks the
 * reviewed questions and the model words the card from the person's own words - but when the person has
 * no words at all, there is nothing to word a card from, and the card's `quality_words` row comes out
 * empty. This module is the smallest honest answer to that: a short, reviewed list of **descriptive
 * texture** words, each with a plain explanation, offered as a suggestion.
 *
 * Three properties make it safe:
 *
 *   1. **Every word describes how a sensation behaves, never what it means.** No word here names a
 *      cause, a condition, a system, a body part or an action, and none of them is a question - so iron
 *      rule 2 is untouched: the bank still owns every question, and this list only offers vocabulary.
 *   2. **Nothing here is ever attributed to the person.** A word enters their answer only when they
 *      choose it (`addWordToAnswer`), which makes it a word they wrote; a word they ignore is simply
 *      absent from the session, so the card cannot carry a suggestion as if it were theirs.
 *   3. **It is deterministic and local.** No provider call, no cost, no latency and no dependency on
 *      whether live mode is configured - so the capability works on submission day and in mock mode
 *      alike, and it can be tested without a network.
 *
 * The list is illustrative rather than exhaustive: the person may always type their own words, and the
 * helper says so.
 *
 * **Which list a question offers is the question's own decision (`ISS-23`).** The helper used to show
 * one fixed list on every question, so a person read the same eight words whether they were being asked
 * where the sensation sits or what it reminds them of. Each question now offers **its own approved
 * vocabulary** - the words the reviewed question already names ("smooth, rough, tight, or loose" for the
 * texture question, "a coin, a palm, or wider" for size) - and the comparison question offers the bank's
 * own comparison phrases, so a person with no words of their own can still give the card the comparison
 * its `intensity_metaphor` row needs. Two questions offer nothing at all, because each asks for
 * something only the person can supply: the one that asks for their own word, and the one that asks for
 * their own number. Nothing here is a question, and nothing here is attributed to the person: a word
 * still reaches their answer only when they tap it.
 */

/** One candidate: the word, and a plain explanation of what it describes. */
export type VocabularyCandidate = { word: string; meaning: string };

/**
 * The reviewed list. Descriptive texture only - how it behaves, in everyday words.
 *
 * Deliberately short: eight words a person can read at a glance, each explained in one line. The
 * explanations are the point - a word nobody understands is no help to someone who has none.
 */
export const SENSATION_VOCABULARY: readonly VocabularyCandidate[] = [
  { word: "fluttering", meaning: "light and quick, like something moving on its own" },
  { word: "vibrating", meaning: "a buzz that keeps going" },
  { word: "pulsing", meaning: "coming and going like a beat" },
  { word: "rippling", meaning: "small waves moving through it" },
  { word: "tingling", meaning: "like tiny pins and needles" },
  { word: "faint", meaning: "barely there, easy to miss" },
  { word: "steady", meaning: "the same the whole time" },
  { word: "wave-like", meaning: "building and easing, over and over" },
];

/**
 * The bank's own comparison phrases - the four examples the reviewed object-metaphor question (`Q5`)
 * already names, offered again to the comparison question (`Q14`) because both ask the person for a
 * comparison and neither invents one.
 *
 * Each phrase satisfies `isComparisonShaped` (`ISS-16/D`), the rule that decides whether an answer may
 * stand as `intensity_metaphor`. That is what makes a tapped phrase reach the card through the existing
 * pipeline: the person chose it, the card quotes it verbatim, and nothing is inferred. The rule is
 * measured against these four phrases by a test, so the two cannot drift apart.
 */
const COMPARISON_PHRASES: readonly VocabularyCandidate[] = [
  { word: "a tight knot", meaning: "pulled together, as if tied" },
  { word: "a warm bath", meaning: "warmth that surrounds it and stays" },
  { word: "a heavy blanket", meaning: "weight lying over it, holding it down" },
  { word: "a buzzing phone", meaning: "a fast buzz that keeps going" },
];

/**
 * The vocabulary each question offers, keyed by the bank's own question id (`ISS-23`).
 *
 * Every id the bank ships has an entry here - one decision, made once and reviewable - and each group's
 * words are the question's own approved wording, so no group introduces a cause, a system, a body part,
 * a condition or an action, and none of them is a question:
 *
 *   - `Q1` "in one spot", "spreading out" - the question's own two alternatives;
 *   - `Q2` "close to the surface", "deep inside";
 *   - `Q3` "steady", "in waves", "wave-like";
 *   - `Q4` the four textures the question names;
 *   - `Q5` and `Q14` the bank's four comparison phrases (`COMPARISON_PHRASES`);
 *   - `Q6` the three quality families the question names;
 *   - `Q7` "a coin", "a palm", "wider";
 *   - `Q8` "stays put", "wanders";
 *   - `Q9` the general list: a colour is the person's own, and no colour is put in front of them;
 *   - `Q10` "a hum", "a squeeze", "a flutter";
 *   - `Q11` nothing - the question asks for the person's own word, so offering words would answer it
 *     for them;
 *   - `Q12` "the same", "clearer", "softer";
 *   - `Q13` nothing - the question asks for the person's own number, and a number is not vocabulary.
 *
 * An id with no entry - a question added to the bank later, or a caller with no question at all - gets
 * the general list, so the helper is never a dead end.
 */
export const VOCABULARY_BY_QUESTION: Readonly<Partial<Record<string, readonly VocabularyCandidate[]>>> = {
  Q1: [
    { word: "in one spot", meaning: "it stays where it is, without moving" },
    { word: "spreading out", meaning: "it reaches beyond where it started" },
  ],
  Q2: [
    { word: "close to the surface", meaning: "you notice it near the outside of your body" },
    { word: "deep inside", meaning: "it feels far in, away from the outside" },
  ],
  Q3: [
    { word: "steady", meaning: "the same the whole time" },
    { word: "in waves", meaning: "it builds and eases, again and again" },
    { word: "wave-like", meaning: "building and easing, over and over" },
  ],
  Q4: [
    { word: "smooth", meaning: "even and flat, with nothing catching" },
    { word: "rough", meaning: "uneven, with a bumpy texture" },
    { word: "tight", meaning: "pulled firm, with no give in it" },
    { word: "loose", meaning: "slack, with no pull in it" },
  ],
  Q5: COMPARISON_PHRASES,
  Q6: [
    { word: "pressure", meaning: "a steady push from inside it" },
    { word: "tingling", meaning: "like tiny pins and needles" },
    { word: "warmth", meaning: "a gentle heat in it" },
  ],
  Q7: [
    { word: "a coin", meaning: "small, about the width of a coin" },
    { word: "a palm", meaning: "about the width of your hand" },
    { word: "wider", meaning: "larger than your hand" },
  ],
  Q8: [
    { word: "stays put", meaning: "it keeps to the same place" },
    { word: "wanders", meaning: "it moves from place to place" },
  ],
  Q9: SENSATION_VOCABULARY,
  Q10: [
    { word: "a hum", meaning: "a low steady sound you can feel" },
    { word: "a squeeze", meaning: "a grip that tightens and eases" },
    { word: "a flutter", meaning: "light and quick, like something moving on its own" },
  ],
  Q11: [],
  Q12: [
    { word: "the same", meaning: "it has not changed while you talked" },
    { word: "clearer", meaning: "easier to notice than it was" },
    { word: "softer", meaning: "less strong than it was" },
  ],
  Q13: [],
  Q14: COMPARISON_PHRASES,
};

/**
 * The vocabulary to offer for a question, by the id the route sent with it.
 *
 * The question's own group, or the general list when the id is unknown, absent or not a question id at
 * all. A question whose group is deliberately empty returns an empty list, and the screen renders no
 * helper for it rather than an empty one.
 */
export function vocabularyFor(questionId: string | null | undefined): readonly VocabularyCandidate[] {
  if (typeof questionId !== "string") return SENSATION_VOCABULARY;

  return VOCABULARY_BY_QUESTION[questionId] ?? SENSATION_VOCABULARY;
}

/** The word as a whole-word pattern, so "steady" is not found inside "unsteady" by accident. */
function wordPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`, "i");
}

/** Whether the answer already carries the word, as a whole word and whatever its case. */
export function answerHasWord(answer: string, word: string): boolean {
  return wordPattern(word).test(answer);
}

/**
 * The answer with the candidate word added to it, or the answer unchanged when it is already there.
 *
 * The person's own words are never touched: the word is appended after them, and nothing already typed
 * is reworded, reordered or removed. Adding the same word twice is not possible, so tapping a word a
 * second time (or tapping a word the person had already typed) changes nothing.
 */
export function addWordToAnswer(answer: string, word: string): string {
  const trimmed = answer.trim();

  if (trimmed.length === 0) return word;
  if (answerHasWord(trimmed, word)) return trimmed;

  return `${trimmed}, ${word}`;
}
