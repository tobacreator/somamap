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
