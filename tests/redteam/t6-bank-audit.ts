import { QUESTION_BANK, type ApprovedQuestion } from "../../src/lib/questionBank.ts";
import type { RedTeamOutcome } from "./types.ts";

/**
 * T6 - bank audit (blueprint Table 7 and Table 11).
 *
 * Required: a script compares src/lib/questionBank.ts against the approved list in
 * Table 11 and finds them identical, and no provocation verb (breathe, move, eat,
 * radiate) appears anywhere in the bank.
 *
 * The approved list below is transcribed from Table 11 and kept here, independently of
 * the bank, exactly as T5 keeps its own copy of the fixed line: if the bank is edited,
 * the diff is what catches it. A drifted second copy is the point of an audit, not a
 * duplication to remove.
 *
 * COUNT DISCREPANCY - reported, not resolved. Table 11 lists THIRTEEN rows, Q1 to Q13,
 * and Chapter 5.2 discusses Q13 by name; Chapter 5's introduction, Table 5 and this
 * row's own blocked-on note call the bank "twelve". The table is the normative list, so
 * the audit diffs all thirteen rows and this module says so in its evidence line. The
 * count needs an explicit decision (BUILD-REPORT.md Entry 19).
 */

/** Table 11, transcribed row by row: id, approved wording, and the texture column. */
export const APPROVED_TABLE_11: readonly ApprovedQuestion[] = [
  { id: "Q1", text: "Does it stay in one spot, or does it spread out?", texture: "Spot vs spread" },
  { id: "Q2", text: "Does it feel close to the surface, or deep inside?", texture: "Surface vs deep" },
  { id: "Q3", text: "Is it steady, or does it come and go in waves?", texture: "Steady vs wave" },
  {
    id: "Q4",
    text: "If it had a texture - smooth, rough, tight, or loose - which would it be?",
    texture: "Material metaphor",
  },
  {
    id: "Q5",
    text: "What everyday thing does it remind you of? A tight knot, a warm bath, a heavy blanket, a buzzing phone?",
    texture: "Object metaphor",
  },
  { id: "Q6", text: "Does it feel more like pressure, tingling, warmth, or something else?", texture: "Quality family" },
  { id: "Q7", text: "How large does it feel - a coin, a palm, or wider?", texture: "Perceived size" },
  { id: "Q8", text: "Does it stay put, or does it wander?", texture: "Mobility" },
  { id: "Q9", text: "If you gave it a color, what color would it be?", texture: "Synesthetic metaphor" },
  { id: "Q10", text: "Is it more like a hum, a squeeze, or a flutter?", texture: "Rhythm" },
  {
    id: "Q11",
    text: "What word would you use to describe it to a friend who feels nothing?",
    texture: "Own vocabulary",
  },
  {
    id: "Q12",
    text: "While we have been talking, has it stayed the same, gotten clearer, or softened?",
    texture: "Change over the session",
  },
  {
    id: "Q13",
    text: "If you gave it a number from 1 to 10 in your own way, what would it be - and what does that number feel like?",
    texture: "Self-chosen intensity",
  },
];

/**
 * The owner-approved addition to the bank, transcribed **independently** of `src/lib/questionBank.ts`
 * exactly as Table 11 is - the audit keeps its own copy of everything it checks, so a change to the
 * bank module cannot quietly change the standard it is measured against.
 *
 * Approved 2026-11-01 as the resolution of `ISS-02`: the three questions the session asked never
 * invited a comparison, so the card's `intensity_metaphor` row was usually empty. Wording is the
 * owner's own. Iron rule 2 names "what it reminds you of" as a permitted texture question.
 */
export const OWNER_APPROVED_ADDITIONS: readonly ApprovedQuestion[] = [
  { id: "Q14", text: "What does it remind you of?", texture: "Comparison / reminder" },
];

/**
 * The provocation verbs Table 7 forbids in the bank. Matched on word boundaries: the
 * requirement is about verbs, and a substring test would fire on words such as "repeat"
 * or "feature" that ask nothing about provocation.
 */
export const PROVOCATION_VERB_PATTERN = /\b(breathe|breathes|breathing|move|moves|moving|eat|eats|eating|radiate|radiates|radiating)\b/i;

/** Every way the bank can differ from the approved list, as readable lines. */
export function diffQuestionBank(
  bank: readonly ApprovedQuestion[],
  approved: readonly ApprovedQuestion[],
): string[] {
  const problems: string[] = [];

  if (bank.length !== approved.length) {
    problems.push(`count: the bank has ${bank.length} question(s), Table 11 has ${approved.length}`);
  }

  approved.forEach((expected, index) => {
    const found = bank[index];

    if (!found) {
      problems.push(`missing question at position ${index + 1}: ${expected.id}`);
      return;
    }

    if (found.id !== expected.id) {
      problems.push(`position ${index + 1}: expected ${expected.id}, found ${found.id}`);
    }

    if (found.text !== expected.text) {
      problems.push(`wording changed for ${expected.id}: "${found.text}"`);
    }

    if (found.texture !== expected.texture) {
      problems.push(`texture column changed for ${expected.id}: "${found.texture}"`);
    }
  });

  for (const extra of bank.slice(approved.length)) {
    problems.push(`unapproved question inserted: ${extra.id}`);
  }

  return problems;
}

export function t6BankAudit(): RedTeamOutcome {
  const problems = diffQuestionBank(QUESTION_BANK, [...APPROVED_TABLE_11, ...OWNER_APPROVED_ADDITIONS]);

  if (problems.length > 0) {
    return {
      status: "FAIL",
      detail: `${problems.length} difference(s) from Table 11: ${problems.slice(0, 4).join("; ")}`,
    };
  }

  const provocations = QUESTION_BANK.filter((question) => PROVOCATION_VERB_PATTERN.test(question.text)).map(
    (question) => question.id,
  );

  if (provocations.length > 0) {
    return {
      status: "FAIL",
      detail: `provocation verb in the bank at ${provocations.join(", ")}`,
    };
  }

  const uniqueIds = new Set(QUESTION_BANK.map((question) => question.id)).size;

  if (uniqueIds !== QUESTION_BANK.length) {
    return { status: "FAIL", detail: `duplicate question ids: ${QUESTION_BANK.length} rows, ${uniqueIds} unique id(s)` };
  }

  return {
    status: "PASS",
    detail: `bank is Table 11's ${APPROVED_TABLE_11.length} rows plus the ${OWNER_APPROVED_ADDITIONS.length} owner-approved addition(s) (${OWNER_APPROVED_ADDITIONS.map((q) => q.id).join(", ")}, approved 2026-11-01 for ISS-02), in order, wording and texture column all matching; no provocation verb in any question; ids unique. Note: Table 11 lists 13 rows while the prose calls the bank "twelve" - flagged in BUILD-REPORT.md Entry 19`,
  };
}
