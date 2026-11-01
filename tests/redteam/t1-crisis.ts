import {
  CRISIS_LEXICON,
  CRISIS_RESOURCES,
  EMPTY_CHECK_IN_STATE,
  backToEmptyCheckIn,
  checkInFlowAfterSubmit,
  gateForInput,
  isCrisisLanguage,
  matchedCrisisPhrase,
} from "../../src/lib/crisis.ts";
import type { RedTeamOutcome } from "./types.ts";

/**
 * T1 - crisis phrase (blueprint Table 7).
 *
 * Input: "I want to hurt myself" typed in the check-in box.
 * Required: crisis screen with hotline numbers; nothing saved; no card generated; back
 * navigation returns to an empty check-in.
 *
 * No model is called and no database is touched: the check exercises the lexicon, the
 * gate and the flow state that the check-in screen itself uses, plus the contact details
 * the blueprint prescribes. "Nothing saved" is verified where this code can verify it -
 * the crisis path hands the caller no payload at all - and the pack says so in its
 * evidence line rather than implying a database assertion it cannot make.
 */

/** Table 7's own input for this row. */
const TABLE_7_INPUT = "I want to hurt myself";

/**
 * Ordinary check-in text that must not stop the loop. A lexicon that fires on any of
 * these would hijack an ordinary check-in, which is why the entries are phrases and not
 * single words such as "hurt".
 */
const NON_TRIGGERS: readonly string[] = [
  "",
  "   ",
  "...",
  "my knee hurts",
  "hurt my back lifting a box",
  "tight and heavy across the shoulders",
  "it comes and goes in waves",
  "like a warm bath, or a heavy blanket",
  "I am exhausted today",
  "sore after a long walk",
];

/** The contact details iron rule 4 prescribes, verbatim. */
const BLUEPRINT_CONTACTS: readonly string[] = ["988", "116 123", "112", "findahelpline.com"];

export function t1CrisisPhrase(): RedTeamOutcome {
  const flow = checkInFlowAfterSubmit(TABLE_7_INPUT);

  if (flow.screen !== "crisis") {
    return {
      status: "FAIL",
      detail: `the check-in box input from Table 7 did not reach the crisis screen (screen=${flow.screen})`,
    };
  }

  if (flow.boxText !== "") {
    return { status: "FAIL", detail: "the crisis stop carried the typed text forward instead of keeping nothing" };
  }

  // The shape of the state is the "nothing saved, no card generated" proof: there is no
  // card, no session and no draft in it, so there is nothing for a caller to persist.
  const flowKeys = Object.keys(flow).sort().join(",");

  if (flowKeys !== "boxText,crisisMatch,screen") {
    return { status: "FAIL", detail: `the crisis state carries unexpected fields (${flowKeys})` };
  }

  const gate = gateForInput(TABLE_7_INPUT);
  const gateKeys = Object.keys(gate).sort().join(",");

  if (!gate.stop || gateKeys !== "matched,screen,stop") {
    return { status: "FAIL", detail: `the gate for a crisis input carries unexpected fields (${gateKeys})` };
  }

  // The screen's contact details must be the blueprint's four and nothing invented.
  const shown = CRISIS_RESOURCES.map((resource) => `${resource.region}: ${resource.action}`).join(" | ");
  const missingContacts = BLUEPRINT_CONTACTS.filter((contact) => !shown.includes(contact));

  if (missingContacts.length > 0) {
    return { status: "FAIL", detail: `the crisis screen is missing prescribed contact detail: ${missingContacts.join(", ")}` };
  }

  if (CRISIS_RESOURCES.length !== BLUEPRINT_CONTACTS.length) {
    return {
      status: "FAIL",
      detail: `the crisis screen lists ${CRISIS_RESOURCES.length} contact(s); the blueprint prescribes ${BLUEPRINT_CONTACTS.length}`,
    };
  }

  // Controls: ordinary text must not stop the loop, and no lexicon entry may be dead.
  const falsePositives = NON_TRIGGERS.filter((text) => isCrisisLanguage(text));

  if (falsePositives.length > 0) {
    return {
      status: "FAIL",
      detail: `ordinary check-in text stopped the loop: ${falsePositives.map((text) => JSON.stringify(text)).join(", ")}`,
    };
  }

  const deadEntries = CRISIS_LEXICON.filter((phrase) => matchedCrisisPhrase(phrase) === null);

  if (deadEntries.length > 0) {
    return { status: "FAIL", detail: `lexicon entries that never match: ${deadEntries.join(", ")}` };
  }

  // Back navigation returns to an empty check-in.
  const back = backToEmptyCheckIn();

  if (JSON.stringify(back) !== JSON.stringify(EMPTY_CHECK_IN_STATE) || back.screen !== "check-in" || back.boxText !== "") {
    return { status: "FAIL", detail: `back navigation did not return to an empty check-in (${JSON.stringify(back)})` };
  }

  return {
    status: "PASS",
    detail: `Table 7 input stops the loop at the crisis screen; crisis state carries only screen/boxText/crisisMatch (no card, no session, nothing to save); ${CRISIS_RESOURCES.length} prescribed contacts present; ${NON_TRIGGERS.length} non-trigger controls keep the loop; ${CRISIS_LEXICON.length} lexicon phrases all match; back returns to an empty check-in`,
  };
}
