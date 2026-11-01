/**
 * The crisis shield - iron rule 4, blueprint Section 5.1 stage 1 and Table 5.
 *
 * If any input carries explicit crisis or self-harm language, the loop stops here: the
 * caller is sent to the static crisis screen, and it is handed nothing to persist. The
 * trigger is language and only language - never a pattern of sensations, never a body
 * region, and never a combination of them, because that would be triage (iron rule 4).
 *
 * The local lexicon below is the "fast path" from Table 10 stage 1: deterministic,
 * instant, no model and no network. Table 10 also says a provider error shows the crisis
 * resources screen rather than passing text through, which is the fail-closed direction
 * this module supports by having no failure mode of its own.
 *
 * The contact details are the blueprint's, verbatim: 988 (US), 116 123 (UK), 112
 * (Nigeria and the EU), and findahelpline.com for everywhere else. No local number was
 * invented, and nothing here evaluates, ranks or interprets what the user wrote.
 *
 * Copy discipline: none of the four words iron rule 5 forbids appears in this file.
 */

/** One contact line on the static crisis screen. */
export type CrisisResource = {
  /** Where the number works, in the blueprint's own words. */
  region: string;
  /** What to do there, in the blueprint's own words. */
  action: string;
};

/** The blueprint's contact details, verbatim and complete. */
export const CRISIS_RESOURCES: readonly CrisisResource[] = [
  { region: "United States", action: "Call or text 988" },
  { region: "United Kingdom", action: "Call 116 123" },
  { region: "Nigeria and the EU", action: "Call 112" },
  { region: "Anywhere else", action: "findahelpline.com" },
];

/**
 * The local lexicon: explicit crisis and self-harm language only. Phrases, not single
 * words, so that ordinary sensation talk ("my knee hurts", "hurt my back") never stops
 * the loop. Matching runs on normalised text, so punctuation, case and hyphenation
 * cannot hide a phrase.
 */
export const CRISIS_LEXICON: readonly string[] = [
  "hurt myself",
  "hurting myself",
  "harm myself",
  "harming myself",
  "kill myself",
  "killing myself",
  "end my life",
  "ending my life",
  "take my own life",
  "take my life",
  "want to die",
  "wish i was dead",
  "wish i were dead",
  "better off dead",
  "suicidal",
  "suicide",
  "self harm",
  "selfharm",
  "cut myself",
  "cutting myself",
  "no reason to live",
  "nothing to live for",
  "don't want to live",
  "do not want to live",
];

/**
 * Lower case, letters and digits only, single spaces: the form both sides are matched in.
 * Exported so the mock adapter can compare recorded fixture inputs the same way.
 */
export function normaliseForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The lexicon phrase an input carries, or null. Deterministic: the same text always
 * returns the same phrase, and the first match in lexicon order wins.
 */
export function matchedCrisisPhrase(text: string): string | null {
  const haystack = normaliseForMatch(text);

  if (haystack.length === 0) return null;

  for (const phrase of CRISIS_LEXICON) {
    const needle = normaliseForMatch(phrase);

    if (needle.length > 0 && haystack.includes(needle)) return phrase;
  }

  return null;
}

/** True when the text carries explicit crisis or self-harm language. */
export function isCrisisLanguage(text: string): boolean {
  return matchedCrisisPhrase(text) !== null;
}

/** Where an input sends the check-in loop. A crisis hit carries no payload to save. */
export type CheckInGate =
  | { stop: true; screen: "crisis"; matched: string }
  | { stop: false; screen: "check-in"; matched: null };

/**
 * The one decision every input passes through before anything else (blueprint Table 10,
 * stage 1). A crisis hit stops the loop: the caller is told to show the static screen
 * and is given no card, no session and no text to write anywhere - the shape of this
 * object is the whole "save nothing" guarantee at this boundary.
 */
export function gateForInput(text: string): CheckInGate {
  const matched = matchedCrisisPhrase(text);

  return matched === null
    ? { stop: false, screen: "check-in", matched: null }
    : { stop: true, screen: "crisis", matched };
}

/**
 * The check-in flow's screen state. A crisis stop keeps nothing: the box is empty and the
 * only thing carried forward is which phrase was matched, for the record.
 */
export type CheckInFlowState =
  | { screen: "check-in"; boxText: string; crisisMatch: null }
  | { screen: "crisis"; boxText: ""; crisisMatch: string };

/** The empty check-in: what "back" returns to, and what a fresh screen starts as. */
export const EMPTY_CHECK_IN_STATE: CheckInFlowState = {
  screen: "check-in",
  boxText: "",
  crisisMatch: null,
};

/**
 * The flow after an input is submitted: the crisis screen and nothing else when the
 * lexicon matched, otherwise the words stay in the box and nothing is saved.
 */
export function checkInFlowAfterSubmit(text: string): CheckInFlowState {
  const gate = gateForInput(text);

  return gate.stop
    ? { screen: "crisis", boxText: "", crisisMatch: gate.matched }
    : { screen: "check-in", boxText: text, crisisMatch: null };
}

/** Back navigation: the empty check-in, with no trace of the crisis screen. */
export function backToEmptyCheckIn(): CheckInFlowState {
  return { ...EMPTY_CHECK_IN_STATE };
}
