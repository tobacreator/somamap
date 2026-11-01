/**
 * Every UI string, one home (blueprint Section 3.2, Table 5: the copy layer).
 *
 * Screens import their wording from here, so there is one place to review. Iron rule 5
 * forbids four words in UI copy; none of them appear in this file, and the only word
 * that needs an exemption - inside the fixed line Rule 5 requires on every screen -
 * appears on the DISCLAIMER_LINE line alone. The red-team copy scan (T5) holds its own
 * independent copy of that line on purpose: if the two ever drift, the scan fails
 * closed instead of following this file wherever it goes.
 */

/** The fixed line iron rule 5 requires on every screen, verbatim. */
export const DISCLAIMER_LINE =
  "SomaMap is a vocabulary and journaling tool. It does not interpret sensations or give medical advice.";

/** The check-in start screen (blueprint Chapter 4.4). */
export const CHECKIN_STEP_LABEL = "Check in";
export const CHECKIN_PROMPT = "Where do you feel it?";
export const CHECKIN_INSTRUCTION = "Tap the body map to name the region you noticed.";

/** The body map itself. */
export const BODY_MAP_ARIA_LABEL = "Body map";
export const VIEW_LEGEND = "View";
export const VIEW_FRONT = "Front";
export const VIEW_BACK = "Back";
export const REGION_READOUT_PREFIX = "Region";
export const REGION_NONE_HINT = "Tap the body map to name a region.";
export const REGION_MAP_NOTE =
  "Region names come from a fixed body map: the same spot always names the same region. Nothing is generated, and nothing is saved yet.";

/** How a zone button introduces itself to a screen reader. */
export function regionButtonLabel(label: string, selected: boolean): string {
  return selected ? `Region ${label}, selected` : `Region ${label}`;
}

/** The check-in box - the free-text surface iron rule 4's lexicon guards (Table 7, T1). */
export const CHECKIN_BOX_LABEL = "Anything you want to put into words";
export const CHECKIN_BOX_PLACEHOLDER = "Type a few words, or leave it blank.";
export const CHECKIN_BOX_SUBMIT = "Continue";
export const CHECKIN_BOX_KEPT = "Your words stay on this screen. Nothing is saved yet.";

/**
 * The interview - blueprint Chapter 5.3 (the Day-4 prompt) and Table 10 stage 2.
 *
 * The question wording is deliberately not here: every question is the reviewed bank's own
 * text, which the route returns, so no copy in this module can drift from Table 11. These
 * strings are only the frame around it - the step label, the progress line, the answer field,
 * the waiting and error states, and the note that nothing is saved.
 */
export const INTERVIEW_STEP_LABEL = "Interview";
export const INTERVIEW_PROGRESS = (step: number, total: number): string => `Question ${step} of ${total}`;
export const INTERVIEW_ANSWER_LABEL = "Your answer";
export const INTERVIEW_ANSWER_PLACEHOLDER = "A few words are enough.";
export const INTERVIEW_ANSWER_SUBMIT = "Continue";
export const INTERVIEW_LOADING = "Getting the next question...";
export const INTERVIEW_ERROR = "That question could not be loaded, and nothing was saved.";
export const INTERVIEW_RETRY = "Try again";
export const INTERVIEW_BACK = "Back to check-in";
export const INTERVIEW_NOTE = "Your answers stay on this screen. Nothing is saved yet.";

/**
 * Shown while the answer field is empty, so the disabled Continue button explains itself instead of
 * looking broken (Phase B; the only string this phase adds, approved by the product owner).
 */
export const INTERVIEW_ANSWER_HINT = "Type a few words to continue.";

/**
 * The static crisis screen (iron rule 4, blueprint Table 5).
 *
 * The screen never repeats what was typed: the matched phrase is not echoed back, and
 * no line on it comments on the user's words. It shows the contact details and the way
 * back, and nothing else.
 */
export const CRISIS_TITLE = "Please reach out for support";
export const CRISIS_BODY = "Nothing you typed was saved. These people can help right now.";
export const CRISIS_RESOURCES_LEGEND = "Crisis lines";
export const CRISIS_BACK = "Back to check-in";

/** The card view (blueprint Section 6.1: the five schema fields, in a calm layout). */
export const CARD_TITLE = "Your card";
export const CARD_NOT_ANSWERED = "Not answered yet";

/** Settings and the delete-everything switch (blueprint Chapter 6.1 and Table 12 row 8). */
export const SETTINGS_TITLE = "Settings";
export const SETTINGS_INTRO = "Your words and photos stay yours. You can remove everything from here.";
export const SETTINGS_LOADING = "Checking your session...";

/**
 * The delete-everything switch, including which project it will act on. The host shown here
 * comes from the same validated target the deletion route uses, so the two cannot disagree.
 */
export const DELETE_EVERYTHING_TARGET_LOCAL = "Target: your local project";
export const DELETE_EVERYTHING_TARGET_HOSTED = "Target: the hosted project";
export const DELETE_EVERYTHING_TARGET_HOST = "Host";
export const DELETE_EVERYTHING_NOT_READY =
  "Deletion is switched off until the environment configuration is corrected.";
export const DELETE_EVERYTHING_NOT_READY_REASON = "Configuration problem";
export const DELETE_EVERYTHING_LABEL = "Delete everything";
export const DELETE_EVERYTHING_EXPLAIN =
  "This removes your check-ins, cards, journal drafts, your profile and your photos from storage. Your account stays, so you can sign in again.";
export const DELETE_EVERYTHING_CONFIRM = "I understand - delete everything";
export const DELETE_EVERYTHING_CANCEL = "Keep my data";
export const DELETE_EVERYTHING_RUNNING = "Deleting...";
export const DELETE_EVERYTHING_DONE = "Everything was removed. Your account is still here.";
export const DELETE_EVERYTHING_PARTIAL =
  "Some of it could not be removed, and nothing else was touched. Try again.";
export const DELETE_EVERYTHING_RETRY = "Try again";

/** Sign-in - the minimum session the delete-everything action needs. */
export const SIGNIN_TITLE = "Sign in";
export const SIGNIN_INTRO = "Sign in to reach your settings.";
export const SIGNIN_EMAIL = "Email";
export const SIGNIN_PASSWORD = "Password";
export const SIGNIN_SUBMIT = "Sign in";
export const SIGNIN_FAILED = "That sign-in did not work.";

/**
 * The five field labels, one per schema field. The keys are the schema's own field
 * names, and a test asserts that this record and the schema carry the same five - so a
 * sixth field cannot appear here without failing.
 */
export const CARD_FIELD_LABELS = {
  location_label: "Where",
  quality_words: "Words you chose",
  intensity_metaphor: "It feels like",
  duration: "How long",
  user_own_sentence: "In your words",
} as const;

