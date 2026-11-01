/**
 * The reviewed question bank - blueprint Table 11, transcribed verbatim.
 *
 * The bank is a constant list: the model may select and order from it, but it may not
 * invent a question, reword one, or append a follow-up (iron rule 2). Every entry below
 * carries the table's own numbering, the question text exactly as approved, and the
 * "texture it captures" column as review metadata. No selection logic lives here - the
 * interview that picks three questions is a later task.
 *
 * COUNT DISCREPANCY - reported rather than silently resolved. Table 11 is titled "The
 * complete question bank" and lists THIRTEEN rows, Q1 to Q13, and the prose in Chapter
 * 5.2 discusses Q13 by name ("the one quantitative anchor"). Chapter 5's introduction,
 * Table 5 and the T6 row all call the bank "twelve". Both cannot be right. The table is
 * the normative list and T6 requires an exact diff against it, so all thirteen rows are
 * transcribed here, verbatim and in order. Nothing was added, removed, reworded or
 * reordered: dropping Q13 to force the count to twelve would be removing an approved
 * question. The count needs an explicit decision, recorded in BUILD-REPORT.md Entry 19.
 *
 * ADDITION - reported, not smuggled in. On 2026-11-01 the owner approved one extra question, Q14
 * "What does it remind you of?", as the resolution of ISS-02: the session's three questions never
 * invited a comparison, so the card's `intensity_metaphor` row was usually empty. Table 11's thirteen
 * rows are unchanged and still live in their own constant; the addition lives in its own list
 * (`OWNER_APPROVED_ADDITIONS`) so the T6 audit can tell an approved addition from unapproved drift.
 *
 * Copy discipline: none of the four words iron rule 5 forbids appears in this file, and
 * no question names a cause, a system or a condition.
 */

/** One approved question, exactly as Table 11 lists it. */
export type ApprovedQuestion = {
  /** The table's own numbering: "Q1" to "Q13". */
  id: string;
  /** The approved question text, verbatim. */
  text: string;
  /** The table's "texture it captures" column, verbatim: review metadata, not UI copy. */
  texture: string;
};

/** Table 11, transcribed row by row, in table order. Unchanged by the approved addition below. */
const TABLE_11_QUESTIONS: readonly ApprovedQuestion[] = [
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
 * One owner-approved addition to the bank, kept in its own list so the audit can tell an approved
 * addition from unapproved drift.
 *
 * **Approved 2026-11-01** as the resolution of `ISS-02` (docs/mvp/ISSUES-AND-BLOCKERS.md): the
 * session's three questions did not invite a comparison, so the card's `intensity_metaphor` row was
 * usually empty. The wording is the owner's own, verbatim: *"What does it remind you of?"*
 *
 * It satisfies iron rule 2 by construction - rule 2 names "what it reminds you of" as one of the
 * texture questions a sensation may be asked about - and it names no cause, system or condition. It
 * carries no provocation verb.
 *
 * `T6` still diffs the bank against Table 11 **exactly**: any addition that is not in this list, any
 * rewording, any reordering and any removal still fails the audit.
 */
export const OWNER_APPROVED_ADDITIONS: readonly ApprovedQuestion[] = [
  { id: "Q14", text: "What does it remind you of?", texture: "Comparison / reminder" },
];

/**
 * The id of the comparison question, so the card's `intensity_metaphor` can take the answer to the
 * question that asked for a comparison rather than guessing from unrelated answers (`ISS-02`).
 */
export const COMPARISON_QUESTION_ID = "Q14";

/**
 * The bank that ships: Table 11's thirteen questions, then the owner-approved additions, in order.
 *
 * The interview reads only this list, so an addition cannot be reached unless it is here, and the
 * audit (`tests/redteam/t6-bank-audit.ts`) compares this list against its **own** copy of Table 11
 * plus its own copy of the approved addition.
 */
export const QUESTION_BANK: readonly ApprovedQuestion[] = [...TABLE_11_QUESTIONS, ...OWNER_APPROVED_ADDITIONS];

/** Table 11's thirteen rows alone, for a caller that needs the blueprint's list without additions. */
export const TABLE_11_ROWS: readonly ApprovedQuestion[] = TABLE_11_QUESTIONS;

/** The bank's approved questions in table order, ids only. */
export function questionIds(): readonly string[] {
  return QUESTION_BANK.map((question) => question.id);
}

/** One approved question by id, or null. */
export function questionById(id: string): ApprovedQuestion | null {
  return QUESTION_BANK.find((question) => question.id === id) ?? null;
}
