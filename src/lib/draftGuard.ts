import { answersWithWords, userVocabulary, type FidelitySource } from "./cardFidelity.ts";
import { CAUSAL_PHRASES, CONDITION_NAME_SAMPLE } from "./patterns.ts";
import type { SensationCard } from "./schema.ts";

/**
 * The draft guard - iron rule 1's second sentence, at the model boundary (Phase 2B).
 *
 * Rule 1 ends by requiring that a model response carrying guidance is discarded and the reviewed
 * fallback card returned. The owner's decision puts it in one step: a draft carrying a
 * recommendation, an interpretation, a cause or a medical claim is **refused whole** - nothing is
 * salvaged from it - and the reviewed fallback renders with one safe server-side record.
 *
 * ## Where it sits, and why
 *
 * It runs inside `wordCard`, after `validateDraftCard` and before `groundModelDraft`. It is the third
 * fail-closed exit beside "the provider cannot answer" and "the draft is not a card", and like them it
 * can only ever *replace* a draft with the reviewed fallback: it cannot add, edit, soften or sanitise
 * anything, so its worst case is a less-worded card, never an unsafe one.
 *
 * ## What it looks at - and what it deliberately does not
 *
 * Phase 2A already owns three of the five fields: `location_label` is the fixed map's label, and
 * `duration` and `user_own_sentence` are the session's own values, so a model's text in those fields is
 * *replaced* before it can reach a card. Judging them would mean judging text that cannot survive, so
 * this guard does not. It concentrates on the two fields a model is allowed to word - the model's own
 * contribution, and the only model values that can reach the screen:
 *
 *   - `quality_words`, where every entry must be a word the user actually typed;
 *   - `intensity_metaphor`, where the value must be the user's own comparison.
 *
 * ## Provenance is field-specific, never "somewhere in the text" (owner adjustment B)
 *
 * A quality word is the user's only as an **exact token** they wrote; a comparison is the user's only
 * as a **whole answer** they wrote. Nothing is matched by loose substring containment, because
 * containment lets a model carve a misleading fragment out of the user's own sentence and present it
 * as theirs - the case the owner named:
 *
 *     user writes:   "I don't think you should rest."
 *     model returns: "you should rest."     <- exact substring, negation gone, and guidance
 *
 * That fragment is not a whole answer, so it is model language, so it is scanned, so the draft is
 * refused. Nothing here rewrites or normalises the user's words to make a value pass: the comparison
 * is byte-identical equality, and a word is a whole token, not a piece of one.
 *
 * ## Limitations, stated plainly (owner decision 2)
 *
 * **This detector is a finite, reviewed list of shapes. It is not the guarantee, and it does not claim
 * to recognise every possible unsafe phrase** - no list can. The guarantee is structural: Phase 2A
 * means no model-authored sentence can reach a card at all, so a card can never carry guidance the
 * user did not write. This list exists to (a) refuse a draft that tries, (b) leave a record of the
 * attempt, and (c) still stand if the grounding is ever loosened. A miss is absorbed by the grounding;
 * a false positive costs the model's wording and never the user's words, because the fallback still
 * carries the user's own sentence, duration and region. The residual this list cannot see is a value
 * reassembled from words the user happened to write, which the grounding's own rules bound to a short
 * word list or a verbatim user comparison - never a sentence.
 *
 * Rule 5's four forbidden stems are deliberately **not** listed here. They are enforced on the source
 * by the red-team copy scan, which holds its own copy; on model text their absence is absorbed by the
 * grounding, because a word the user never wrote cannot survive it. Adding them here would put the
 * words themselves back into `src/`, which is the one thing that scan exists to prevent.
 */

/**
 * Second-person address. This product reflects the user's own description back to them; it never
 * speaks *to* them, so a model value that addresses a reader is not this product's voice. Matched as
 * a whole word, so "young" is not "you".
 */
const SECOND_PERSON: readonly string[] = ["you", "your", "yours", "yourself", "yourselves"];

/**
 * Reviewed instruction shapes - the vocabulary of guidance rather than of a sensation. Every entry is
 * a whole word, and every entry is only ever tested against text the model wrote: a user's own word is
 * exempt before this list is consulted, so "rest" as a word the user typed is untouched.
 */
const INSTRUCTION_WORDS: readonly string[] = [
  "avoid", "consider", "ensure", "exercise", "help", "hydrate", "medicate", "must", "need", "ought",
  "recommend", "reduce", "relax", "rest", "should", "sleep", "stretch", "try", "worth",
];

/** Reviewed clinical shapes: the vocabulary of a clinic, not of a sensation. Whole words only. */
const CLINICAL_WORDS: readonly string[] = [
  "doctor", "dose", "emergency", "hospital", "medication", "medicine", "physician", "prescription",
  "referral", "urgent",
];

/**
 * The reviewed phrases. Causal and interpretive language reuses the journal's own reviewed list
 * (`CAUSAL_PHRASES`), so the two guards cannot drift apart; the rest are guidance shapes that are
 * phrases rather than single words.
 */
const PROHIBITED_PHRASES: readonly string[] = [
  ...CAUSAL_PHRASES,
  "check with", "keep an eye", "make sure", "see a", "speak to", "talk to",
];

/** Every single-word shape, in one list, so the scan reads as one rule. */
const PROHIBITED_WORDS: readonly string[] = [...SECOND_PERSON, ...INSTRUCTION_WORDS, ...CLINICAL_WORDS];

/** Whether a whole word appears: "rest" must not fire on "restless", nor "you" on "young". */
function hasWord(lower: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(lower);
}

/**
 * The first prohibited shape in a piece of model-written text, or null.
 *
 * The returned value is a category, for this module's own tests only: it is never logged and never
 * stored. The server-side record carries field names, question ids and the reason - never content.
 */
function prohibitedIn(text: string): string | null {
  const lower = text.toLowerCase();

  for (const phrase of PROHIBITED_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }

  for (const name of CONDITION_NAME_SAMPLE) {
    if (hasWord(lower, name)) return name;
  }

  for (const word of PROHIBITED_WORDS) {
    if (hasWord(lower, word)) return word;
  }

  return null;
}

/**
 * Whether the model's vocabulary selection carries prohibited language.
 *
 * An entry that is an **exact token the user typed** is their own word and is never a reason to refuse
 * anything (owner decision 4): a single word carries no guidance, and a word the user wrote is theirs
 * however it reads. Every other entry is the model's own language - a synonym, a re-description, a
 * phrase placed in the list - and is scanned. A word matches as a whole token, never as a fragment of a
 * longer one.
 */
function qualityWordsCarryProhibited(words: readonly string[], source: FidelitySource): boolean {
  const vocabulary = userVocabulary(source);

  return words.some((word) => {
    const trimmed = word.trim();

    if (trimmed.length === 0) return false;
    if (vocabulary.has(trimmed.toLowerCase())) return false;

    return prohibitedIn(trimmed) !== null;
  });
}

/**
 * Whether the model's comparison carries prohibited language.
 *
 * The user's own comparison is exempt only as a **whole answer** they wrote - compared byte for byte,
 * with no trimming, re-casing or other normalisation applied to make it pass. A phrase carved out of
 * one of their answers is a model extraction, and an extraction can drop a negation ("I don't think
 * you should rest." -> "you should rest."), so it is model language and is scanned.
 */
function metaphorCarriesProhibited(candidate: string, source: FidelitySource): boolean {
  const trimmed = candidate.trim();

  if (trimmed.length === 0) return false;
  if (answersWithWords(source).includes(trimmed)) return false;

  return prohibitedIn(trimmed) !== null;
}

/**
 * The prohibited language in a model's draft, as the **names of the fields that carry it** - never the
 * text.
 *
 * An empty list means the draft may go on to the grounding. A non-empty list means the draft is
 * refused whole: `wordCard` renders the reviewed fallback and records one `prohibited-language`
 * violation naming these fields and the question ids, with no content and no secret in it.
 */
export function prohibitedLanguageIn(card: SensationCard, source: FidelitySource): readonly string[] {
  const keys: string[] = [];

  if (qualityWordsCarryProhibited(card.quality_words, source)) keys.push("quality_words");
  if (metaphorCarriesProhibited(card.intensity_metaphor, source)) keys.push("intensity_metaphor");

  return keys;
}
