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

import { EXTERNAL_PROVIDER_NAME } from "./externalProcessing.ts";

/** The fixed line iron rule 5 requires on every screen, verbatim. */
export const DISCLAIMER_LINE =
  "SomaMap is a vocabulary and journaling tool. It does not interpret sensations or give medical advice.";

/** The check-in start screen (blueprint Chapter 4.4). */
export const CHECKIN_STEP_LABEL = "Check in";
/**
 * Shown for the moment before the check-in flow streams in: the flow needs the processing mode, and
 * that is read on the server per request (Phase 2D copy follow-up). It is the same shape as the
 * settings screen's own loading line.
 */
export const CHECKIN_LOADING = "Getting the check-in ready...";
export const CHECKIN_PROMPT = "Where do you feel it?";
export const CHECKIN_INSTRUCTION = "Tap the body map, or type where it is.";

/** The body map itself. */
export const BODY_MAP_ARIA_LABEL = "Body map";
export const VIEW_LEGEND = "View";
export const VIEW_FRONT = "Front";
export const VIEW_BACK = "Back";
export const REGION_READOUT_PREFIX = "Region";
export const REGION_NONE_HINT = "Tap the body map to name a region.";
export const REGION_MAP_NOTE =
  "Region names come from a fixed body map: the same spot always names the same region. Nothing is generated, and this screen saves nothing.";

/**
 * The location field (Phase 2H).
 *
 * The body map is a suggestion, not a vocabulary. A person may type anything from "left wrist" to "the
 * spot under my right shoulder blade", and their words are kept as written - capitalisation and all -
 * because the location is theirs. "Prefer not to say" is an answer in its own right, not a missing one,
 * and the card names no location when it is chosen.
 */
export const LOCATION_FIELD_LABEL = "Where you feel it";
export const LOCATION_FIELD_PLACEHOLDER = "Type where it is, or tap the map.";
export const LOCATION_FIELD_HINT = "Your own words are fine - left wrist, jaw, or something else.";
export const LOCATION_PREFER_NOT_TO_SAY = "Prefer not to say";
export const LOCATION_PREFER_NOT_TO_SAY_NOTE = "Your card will not name a location.";

/**
 * The body map's compact control, shown only when the screen is too short to hold the map and the rest
 * of the check-in screen at once (Phase 2H fix). The map is then one tap away, and nothing about it
 * changes when it opens: the same fourteen tap targets, the same selection, the same readout.
 */
export const LOCATION_MAP_CHOOSE = "Choose on body map";
export const LOCATION_MAP_HIDE = "Hide the body map";

/** How a zone button introduces itself to a screen reader. */
export function regionButtonLabel(label: string, selected: boolean): string {
  return selected ? `Region ${label}, selected` : `Region ${label}`;
}

/** The check-in box - the free-text surface iron rule 4's lexicon guards (Table 7, T1). */
export const CHECKIN_BOX_LABEL = "Anything you want to put into words";
export const CHECKIN_BOX_PLACEHOLDER = "Type a few words, or leave it blank.";
export const CHECKIN_BOX_SUBMIT = "Continue";
export const CHECKIN_BOX_KEPT =
  "Your words stay on this screen until you continue. A finished card is saved to your journal when you are signed in.";

/**
 * The interview - blueprint Chapter 5.3 (the Day-4 prompt) and Table 10 stage 2.
 *
 * The question wording is deliberately not here: every question is the reviewed bank's own
 * text, which the route returns, so no copy in this module can drift from Table 11. These
 * strings are only the frame around it - the step label, the progress line, the answer field,
 * the waiting and error states, and the note about what happens to the answers.
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

/**
 * Shown when the public demo's own guard refuses a turn (`ISS-27`).
 *
 * A `429` is not a failure of the interview and not a failure of the person: the request was refused
 * before the state machine ran, so nothing was worded, nothing was sent to a model, and nothing was saved.
 * The line says exactly that.
 *
 * It is deliberately one sentence for both counters - the per-visitor window and the per-instance one - so
 * the screen cannot tell a caller which limit it hit, and a person is not asked to understand a budget.
 *
 * There is no "Try again" control beside it, on purpose: an immediate retry is refused by the same window,
 * so offering the button would offer something the product already knows will fail. The way on is back to
 * the check-in, and the screen never retries by itself.
 */
export const INTERVIEW_BUSY =
  "The demo is busy right now. Nothing was sent to a model, and nothing was saved. Try again in a few minutes.";

/**
 * Shown when a live turn produced no model wording (`ISS-28` follow-up).
 *
 * The product fails closed: if the provider refuses, times out or answers with something the strict schema
 * cannot accept, the card is worded from SomaMap's own reviewed copy and the person still gets a complete,
 * honest card. That is the right behaviour - and until now it was **invisible**, so a working live build
 * and a refused one looked identical on screen, which is exactly what the owner asked to fix before the
 * demonstration.
 *
 * The line says three true things and no more: the model could not be reached, the card uses SomaMap's own
 * reviewed wording, and the person's own words are untouched. It makes no claim about why, which the client
 * genuinely does not know - the reason is a content-free category recorded on the server.
 */
export const CARD_FROM_REVIEWED_WORDING =
  "The model could not be reached for this card, so SomaMap used its own reviewed wording. Your words are unchanged.";
export const INTERVIEW_NOTE =
  "Your answers stay on this screen until the card is finished. The finished card is saved to your journal when you are signed in.";

/**
 * Shown while the answer field is empty, so the disabled Continue button explains itself instead of
 * looking broken (Phase B; the only string this phase adds, approved by the product owner).
 */
export const INTERVIEW_ANSWER_HINT = "Type a few words, or say you are not sure yet.";

/**
 * The way past a question a person cannot answer yet (`ISS-25`).
 *
 * The interview used to require words on every question: the submit button stayed disabled until
 * something was typed, and the hint said so. A person who had no words for a question therefore had to
 * write something to move on - which is how "Don't know how to describe it" ended up as a card's own
 * sentence, with the product having asked for a description it never got.
 *
 * This is the honest alternative. The question is left unanswered, the card says "Not answered yet" for
 * it, and nothing is invented: an unanswered question contributes no word to the card, and the answers
 * that were given are worded exactly as before. The second line is a promise the app can now keep -
 * a saved card can be edited (`ISS-25`) - so it is safe to say.
 */
export const INTERVIEW_UNSURE = "Not sure about this one";
export const INTERVIEW_UNSURE_NOTE = "Leaving a question unanswered is allowed. You can edit your card later.";

/**
 * The vocabulary helper (`ISS-22`).
 *
 * The interview's premise is that a person may have a sensation and no words for it. The helper offers a
 * short reviewed list of descriptive words with one-line explanations, and the words go into the answer
 * the person is writing only when they tap one - so a suggestion becomes theirs by their own act, and
 * one they ignore never reaches the card. The note says that out loud, because a list of words a product
 * puts in front of someone must not look like something the product decided about them.
 */
export const INTERVIEW_VOCABULARY_SUMMARY = "Not sure how to describe it? Try a word";
export const INTERVIEW_VOCABULARY_NOTE =
  "Suggestions only: tap one to add it to your answer, or keep your own words. Nothing is added unless you tap it.";
export const INTERVIEW_VOCABULARY_WORD_LABEL = (word: string): string => `Add ${word} to your answer`;

/**
 * Shown while the last answer is being turned into a card.
 *
 * The completing turn is the only turn that reaches a provider, so it is the only turn that can take a
 * moment - and "Getting the next question..." is the wrong sentence for it, because no question is
 * coming. That mismatch is what made the screen look frozen on the last question (`ISS-22`).
 */
export const INTERVIEW_COMPLETING = "Putting your card together...";

/**
 * The external processing disclosure and its acknowledgement (Phase 2D).
 *
 * The interview is worded by an external model provider, so the user's own words - the description
 * they wrote, the region they tapped, and their answers - leave SomaMap for a third party. This copy
 * says that plainly, names the provider, and asks for an explicit act before the first request.
 *
 * Three rules this wording keeps:
 *
 *   1. **No unverified claim.** Nothing here says what the provider does with the words: no
 *      retention, deletion, training, storage, encryption or location statement appears, because
 *      none of those has been independently verified for this build.
 *   2. **No duplication of the fixed line.** Iron rule 5's sentence stays where it is, in
 *      `DISCLAIMER_LINE`, rendered once per screen by the shell (`Screen` -> `DisclaimerFooter`).
 *      Nothing here restates it, so the two cannot drift or double up.
 *   3. **No prohibited stem.** None of rule 5's four words appears, and the word the fixed line
 *      already owns is not used here either, so the copy scan (T5) stays clean.
 */
/**
 * The external processing disclosure and its acknowledgement (Phase 2D).
 *
 * The disclosure says what the build the user is actually on does, and nothing else:
 *
 *   - **mock mode** (the shipped default) has no external provider at all, so its copy says so and
 *     makes no claim that anything is sent to Baseten. Telling a user their words are going to a third
 *     party when no request leaves the process would be false, and frightening for nothing;
 *   - **live mode** names Baseten, names every word that goes there - the description the user wrote,
 *     the region they tapped, and their answers - and says those details may be sent again as the
 *     interview continues, because every turn re-sends them.
 *
 * Which set is shown is decided by the server (`modelMode()`), never guessed by the client, so the copy
 * cannot disagree with what the running build does.
 *
 * Three rules both sets keep:
 *
 *   1. **No unverified claim.** Nothing here says what a provider does with the words: no retention,
 *      deletion, training, storage, encryption or location statement appears, because none of those has
 *      been independently verified for this build.
 *   2. **No duplication of the fixed line.** Iron rule 5's sentence stays where it is, in
 *      `DISCLAIMER_LINE`, rendered once per screen by the shell (`Screen` -> `DisclaimerFooter`).
 *   3. **No prohibited stem.** None of rule 5's four words appears, so the copy scan (T5) stays clean.
 */
export type ProcessingDisclosure = {
  /** The first sentence: who words the card. */
  ai: string;
  /**
   * What travels and to whom - the sentence a person must be able to read **without opening anything**.
   * It is never only in the expander: hiding the fact that data leaves the product would be the one
   * failure this screen exists to prevent.
   */
  data: string;
  /** The primary control's label. */
  acknowledge: string;
  /** The detail behind the expander: the provider's name, and exactly what is sent. */
  details: string;
};

/** What the user is told when nothing is sent anywhere: this build words the card itself. */
export const EXTERNAL_PROCESSING_MOCK: ProcessingDisclosure = {
  ai: "In this build the interview is worded by SomaMap itself, with no external provider involved.",
  data: "The description you wrote, the location you chose or typed, and your answers are used to word your card. They are not sent to Baseten or to any other external provider.",
  acknowledge: "Continue without AI",
  details:
    "Nothing leaves this build: the card is worded from your own answers, and no external provider is contacted.",
};

/** What the user is told when their words do go to Baseten: who, which words, and how often. */
export const EXTERNAL_PROCESSING_LIVE: ProcessingDisclosure = {
  ai: "SomaMap uses an external AI provider to help shape your sensation card.",
  data: "Your description, selected location, and interview answers are sent to Baseten, and they may be sent again as the interview goes on.",
  acknowledge: "Continue with AI",
  details: `The provider is ${EXTERNAL_PROVIDER_NAME}. What is sent: the description you wrote, the location you chose or typed, and each answer you give - one request per turn, and nothing else.`,
};

/** The disclosure for a mode, by mode. The server decides which one is shown. */
export const EXTERNAL_PROCESSING_DISCLOSURE: Record<"mock" | "live", ProcessingDisclosure> = {
  mock: EXTERNAL_PROCESSING_MOCK,
  live: EXTERNAL_PROCESSING_LIVE,
};

/** The card's heading, and the label on the expander that carries the provider's name. */
export const EXTERNAL_PROCESSING_TITLE = "A note about your words";
export const EXTERNAL_PROCESSING_DETAILS_LABEL = "Which provider, and what is sent";
export const EXTERNAL_PROCESSING_DECLINE = "Not now";
export const EXTERNAL_PROCESSING_DECLINED =
  "Nothing was sent. Your words are still here, and you can start the interview whenever you want.";

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

/**
 * What the user can do with a finished card (`ISS-14`).
 *
 * The card used to be a dead end: once it was on screen there was no way back into the answers, no
 * way to change the region, and no way to begin again. These are those three actions, plus the
 * confirmation the restart asks for, because starting again throws the answers on screen away.
 *
 * Iron rule 5: none of the four words it forbids appears in any of these, and nothing here comments
 * on what the user described.
 */
export const CARD_EDIT = "Edit my answers";
export const CARD_CHANGE_REGION = "Change the region";

/**
 * Editing a saved card (`ISS-25`).
 *
 * A card in the journal used to be readable and nothing else. These are the words for the two things a
 * person can revise without being asked anything again - their own sentence, and where they feel it -
 * and for the failure line, which says what happened rather than what the product hopes happened. The
 * note is the honest scope: the other three rows are not touched by this screen.
 */
export const CARD_EDIT_OPEN = "Edit this card";
export const CARD_EDIT_SENTENCE_LABEL = "In your words";
export const CARD_EDIT_SENTENCE_HINT =
  "Your own words, exactly as you want them kept. Leave it blank if you would rather say nothing here.";
export const CARD_EDIT_REGION_LABEL = "Where you feel it";
export const CARD_EDIT_REGION_PLACEHOLDER = "Type where it is, or tap the map.";
export const CARD_EDIT_REGION_HINT = "Leave it blank if you would rather not name a place.";
export const CARD_EDIT_NOTE =
  "This screen changes your sentence and the place. The words you chose, your comparison and how long stay exactly as they are.";
export const CARD_EDIT_SAVE = "Save changes";
export const CARD_EDIT_SAVING = "Saving your changes...";
export const CARD_EDIT_SAVED = "Your card has been updated.";
export const CARD_EDIT_FAILED =
  "That change was not saved, so your card is unchanged. What you typed is still here - try again when you are ready.";
export const CARD_EDIT_CANCEL = "Keep it as it was";
export const CARD_START_NEW = "Start a new check-in";

/**
 * The confirmation the restart asks for.
 *
 * Its second half used to read "and nothing was saved", and that sentence contradicted the line directly
 * above it on the same screen: a signed-in person is told "Saved to your journal.", and one tap later is
 * told that nothing was saved. The sentence was meant to describe the **action** - starting again writes
 * nothing - but it reads as a claim about the card, and it was false for the case most people are in.
 *
 * The wording now speaks only about the action, and its reassurance is conditional on purpose. The
 * confirmation is shown whichever save line the screen is carrying, so it has to be true for all four of
 * them: "Anything already saved to your journal stays there" holds for a card that was written, for a
 * signed-out card that never was, and for a write that failed - and it claims nothing about a write still
 * in flight. An unconditional "your card will remain in your journal" would be false for the signed-out
 * card and for the failed write, and premature while a write is in flight, which is why it is not the
 * sentence used. The restart itself is unchanged: it clears what is on screen and touches no journal row.
 */
export const CARD_START_NEW_CONFIRM =
  "Start a new check-in? This clears the answers on this screen, and the new check-in starts with a blank set of answers. The cards already in your journal stay there.";

export const CARD_START_NEW_KEEP = "Keep this card";

/**
 * Editing the answers already given: the step label, the two ways to move between the questions, and
 * the two ways out. The question wording itself is never here - it is the bank's own text, which the
 * session was asked, so an edit screen can only ever show a question the user was actually asked.
 */
export const EDIT_STEP_LABEL = "Edit your answers";
export const EDIT_PREVIOUS = "Previous question";
export const EDIT_NEXT = "Next question";
export const EDIT_SAVE = "Save changes";
export const EDIT_CANCEL = "Cancel";
export const EDIT_SAVING = "Saving your changes...";

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

/**
 * The journal - the user's own saved cards, and counts of the words on them.
 *
 * Iron rule 3 lives in this wording: the journal counts the user's own words and shows the user's own
 * sentences, and nothing here says what any of it means. No line comments on a card, names a cause, or
 * draws a conclusion; the note beside the counts says out loud that the counting is all that happens.
 *
 * Iron rule 5: none of the four words it forbids appears below.
 */
export const JOURNAL_STEP_LABEL = "Journal";
export const JOURNAL_TITLE = "Your journal";
export const JOURNAL_INTRO = "The cards you have made, newest first. These are your own words.";
export const JOURNAL_LOADING = "Getting your journal ready...";
export const JOURNAL_LOAD_FAILED = "Your journal could not be loaded. Nothing was changed.";
export const JOURNAL_EMPTY_TITLE = "No saved cards yet";
export const JOURNAL_EMPTY_BODY = "Finish a check-in and its card is saved here, with the words you chose.";
export const JOURNAL_START_CHECKIN = "Start a new check-in";
export const JOURNAL_COUNT = (count: number): string => (count === 1 ? "1 saved card" : `${count} saved cards`);
export const JOURNAL_WORDS_TITLE = "Words you chose";
export const JOURNAL_WORDS_NOTE = "Counted from the words on your own cards, and nothing else. SomaMap does not read them.";
export const JOURNAL_WORDS_EMPTY = "No words saved yet.";
export const JOURNAL_REGIONS_TITLE = "Places you named";
export const JOURNAL_REGIONS_EMPTY = "No places named yet.";
export const JOURNAL_OPEN = "Open this card";
export const JOURNAL_BACK = "Back to your journal";
export const JOURNAL_NOT_FOUND = "That card is not here.";

/** What the interview screen says about saving, so a failed save is never silent. */
export const JOURNAL_CARD_SAVING = "Saving your card...";
export const JOURNAL_CARD_SAVED = "Saved to your journal.";
export const JOURNAL_CARD_SAVE_FAILED =
  "This card could not be saved. Nothing was lost - it is still on this screen.";

/**
 * The signed-out card, said honestly (`ISS-17`).
 *
 * The interview needs no account, so a person with no session can finish a card - and the app used to
 * try to write it anyway, take a 401, and show the failure line. Nothing is attempted now, and this is
 * what the screen says instead: the fact (not saved), the reason (not signed in), and what is true of
 * the card at that moment (it is still on screen). It makes no claim about the future, and it never
 * says the card was saved.
 */
export const JOURNAL_CARD_SIGNED_OUT =
  "This card is in your journal for now, in this browser tab. It is not saved anywhere else, and it goes when the tab closes. Sign in to keep it.";
export const JOURNAL_CARD_SIGN_IN_LINK = "Sign in to keep your cards";
export const JOURNAL_VIEW = "View your journal";

/**
 * The in-session journal (`ISS-28`) - the journal a visitor has without an account.
 *
 * The product decision: a person must be able to finish a check-in, get a card and look at their journal
 * before deciding whether to create an account. Signing in is for *keeping* the journal, not for using the
 * product.
 *
 * The copy does three things, and all three matter:
 *
 *   1. **It says where the cards are** - this browser tab - so nobody has to guess whether something was
 *      saved to an account they never made.
 *   2. **It says they are temporary**, in plain words, before the person relies on them. "It goes when the
 *      tab closes" is the whole limitation, stated rather than discovered.
 *   3. **It never says "saved"**, and it never implies a permanence the store cannot provide. The word
 *      "saved" is kept for the one thing that is actually saved: a card in an account's journal.
 *
 * Iron rule 5: none of the four words the rule forbids appears below.
 */
export const ANON_JOURNAL_TITLE = "Your journal for now";
export const ANON_JOURNAL_INTRO =
  "These cards are in this browser tab, and they are not saved anywhere else yet. They are here while the tab is open, and they go when it closes.";
export const ANON_JOURNAL_EMPTY_TITLE = "No cards yet";
export const ANON_JOURNAL_EMPTY_BODY = "Finish a check-in and its card appears here, for as long as this tab is open.";
export const ANON_JOURNAL_KEEP_TITLE = "Want to keep these?";
export const ANON_JOURNAL_KEEP_BODY =
  "An account keeps your cards, so they are still here tomorrow and on another device.";
export const ANON_JOURNAL_SIGN_IN = "Sign in to keep them";

/**
 * What the card screen says when the browser will not keep an in-session journal at all (`ISS-28`).
 *
 * Some browsers refuse storage outright (Safari in private mode has thrown on the access). The card is
 * still on screen and nothing is lost - but saying it is "in your journal" would be false, so this line is
 * used instead of the usual one, and it says only what is true.
 */
export const ANON_JOURNAL_UNAVAILABLE =
  "This browser would not keep a journal for this tab, so this card is only on this screen. Nothing was lost.";

/**
 * Moving in-session cards into an account (`ISS-28`), and only ever with an explicit yes.
 *
 * Nothing is written to a database until the person confirms: the anonymous journal is theirs to keep or
 * to hand over, and a silent transfer would be exactly the persistence the product decision rules out. The
 * partial line exists because a transfer is several writes - what landed has landed, and what did not is
 * still in the tab, which is also what makes a second attempt safe.
 */
export const ANON_TRANSFER_TITLE = "Save these cards to your journal?";
export const ANON_TRANSFER_BODY =
  "They are in this browser tab right now. Saving them puts them in your journal, where they stay.";
export const ANON_TRANSFER_SAVE = "Save them to my journal";
export const ANON_TRANSFER_KEEP = "Leave them for now";
export const ANON_TRANSFER_SAVING = "Saving your cards...";
export const ANON_TRANSFER_DONE = "All of them are in your journal now.";
export const ANON_TRANSFER_PARTIAL =
  "Some of them are in your journal, and the rest are still here in this tab. Try again when you are ready.";
export const ANON_TRANSFER_FAILED =
  "None of them were saved, and they are all still here in this tab. Nothing was lost.";

/**
 * The ways on from Settings (`ISS-17`).
 *
 * Settings used to be a dead end: it carried the delete switch and nothing else, so a signed-in person
 * could not reach the journal, the check-in or the home page without editing the address bar. These are
 * those three links and the sign-out control. Two of the three labels are the journal's own strings
 * reused rather than retyped - the same destination should not have two names.
 */
export const SETTINGS_NAV_LABEL = "Go to";
export const SETTINGS_NAV_JOURNAL = JOURNAL_TITLE;
export const SETTINGS_NAV_CHECKIN = JOURNAL_START_CHECKIN;
export const SETTINGS_NAV_HOME = "Home";
export const SETTINGS_SIGN_OUT = "Sign out";
export const SETTINGS_SIGN_OUT_BUSY = "Signing out...";
export const SETTINGS_SIGN_OUT_FAILED = "Signing out did not work. Nothing was changed. Try again.";

/**
 * Which model processing this deployment is actually using (`ISS-18`).
 *
 * The interview's disclosure already tells the *person* which processing their words get, because that
 * is a decision they make. This panel tells the *operator* something different and just as necessary:
 * whether live mode is on, and if it is not usable, why not. Without it, a build with `MODEL_MODE=live`
 * and a refused provider configuration looks identical to a working one - every card silently renders
 * the reviewed fallback - and "the AI is live" becomes a claim nobody can check.
 *
 * It names the provider host, the model and the timeout, and it never names or carries the key. Nothing
 * here is user-facing copy: it appears on Settings, beside the Supabase target, for the same reason that
 * panel exists - the environment on screen should be the environment that is acted on.
 */
export const PROCESSING_TITLE = "Processing";
export const PROCESSING_MOCK =
  "Mock mode: the interview is worded by this build's own recorded examples. Nothing is sent to an external provider.";
export const PROCESSING_LIVE =
  "Live mode: the interview is worded by Baseten, an external provider, from the words the person gave.";
export const PROCESSING_NOT_READY =
  "Live mode is switched on, but the provider configuration was refused, so the reviewed fallback card is used and nothing is sent.";
export const PROCESSING_NOT_READY_REASON = "Reason";
export const PROCESSING_HOST = "Provider host";
export const PROCESSING_MODEL = "Model";
export const PROCESSING_TIMEOUT = "Timeout";

/**
 * The public home page.
 *
 * The H1, the lead line, the supporting line, the four supporting points and the closing line are the
 * owner's positioning for the Meta Global AI Developer Hackathon, written into the page's existing voice,
 * and are asserted verbatim by `src/lib/landingCopy.test.ts` - so "verbatim" stays a property rather than
 * an intention, and a silent reword fails a check.
 *
 * What changed, and why it is recorded here: the page carried the market validation report's landing copy,
 * which opened on where a sensation is ("Point at your body") and closed on taking the words to an
 * appointment. That appointment was the only reason the page gave for using the product, and it pointed at
 * a clinical conversation the product neither serves nor claims. The H1 now names the difficulty the
 * product actually addresses - a person can feel something and still not have the words - and the page
 * says plainly what it is not (`HOME_SUPPORT_LINE`, `HOME_SECTIONS`).
 *
 * The three-step explainer is unchanged: it still describes the flow, and it is still the report's
 * approved wording.
 *
 * Deliberately absent: the report's four FAQ answers (their wording is not in this workspace, and
 * inventing them would be inventing approved copy), any claim about what a sensation means or what
 * causes it, any promise about what an external provider does with a person's words, and any restatement
 * of the fixed line, which the shell renders on every screen.
 */
export const HOME_TITLE_TAG = "SomaMap - find the words for what you feel in your body";
export const HOME_H1 = "You know what you feel. Finding the words is another matter.";
export const HOME_SUBHEAD =
  "SomaMap helps you put physical sensations into words - one question, one description, one moment at a time.";

/**
 * The second line of the hero - the one that answers the difficulty the H1 names.
 *
 * It is separate from the lead line on purpose. The lead says what the product does; this says what the
 * person does not have to bring with them, which is the whole reason the page exists: no terms, no
 * preparation, no complete sentence required to begin.
 */
export const HOME_SUBHEAD_2 = "You do not need to know the right terms. Start with what you notice.";

/**
 * The line under the two actions.
 *
 * The positioning for this page proposed a line ending in a word this product is not allowed to print.
 * That wording cannot be used: the stem is one of the four iron rule 5 forbids, and the red-team copy scan
 * greps for all four across `src/app`, `src/components` and `src/lib` - comments included, which is how the
 * first draft of this very note failed its own pack. The meaning is kept - the product draws no conclusion
 * about what a person describes - in words the scan allows.
 */
export const HOME_SUPPORT_LINE = "Your words. Your experience. No conclusions drawn.";

/** The approved three-step explainer, as the report writes it and as the page's three blocks. */
export const HOME_STEPS_SENTENCE = "Tap it. Describe it with a little help. Bring the words.";
export const HOME_STEPS: readonly string[] = [
  "Tap it.",
  "Describe it with a little help.",
  "Bring the words.",
];

export const HOME_STEPS_TITLE = "How it works";
export const HOME_PRIMARY_ACTION = "Start describing";
export const HOME_SECONDARY_ACTION = "Sign in";
export const HOME_SIGNUP_ACTION = "Create an account";
export const HOME_JOURNAL_ACTION = "See your journal";

/**
 * The four supporting points, as the owner's positioning writes them.
 *
 * Each one is a claim the product can actually keep, and the fourth is the only place this page says how
 * the interview is guided - which it says precisely, because the precise version is the true one:
 *
 *   - every question is chosen from the reviewed set in `src/lib/questionBank.ts`, whether the choice is
 *     made by the model (`guide.ts`) or by the reviewed sequence the mock build walks;
 *   - the wording of every question is the bank's own, and the region label comes from the fixed
 *     geometric map, never from a model;
 *   - every word offered can be taken, left, refused as unsure, or replaced with the person's own, and
 *     nothing reaches the card unless the person chooses it.
 *
 * What is deliberately absent: no claim that the product understands a body, works out a cause, or
 * notices anything the person did not write; no claim of personalisation beyond "the next question
 * follows what you wrote"; and no statistic, testimonial or story, because none exists to cite.
 */
export type HomeSection = { title: string; body: string };

export const HOME_SECTIONS_TITLE = "What SomaMap is for";

export const HOME_SECTIONS: readonly HomeSection[] = [
  {
    title: "Some feelings are hard to explain.",
    body: "A sensation can be familiar and still difficult to put into words. SomaMap gives you a place to describe what you notice, in your own language.",
  },
  {
    title: "Explore words. Keep the ones that fit.",
    body: "SomaMap offers words that might fit. Take one, leave it, say you are not sure, or write your own - nothing is added to your card unless you choose it.",
  },
  {
    title: "Your experience stays yours.",
    body: "SomaMap helps you describe sensations. It does not tell you what they mean, work out what caused them, or name a condition.",
  },
  {
    title: "A new way to explore the language of sensation.",
    body: "SomaMap explores how AI can help guide a person toward words for an experience that is hard to describe. The interview asks one question at a time, and the wording of every question is SomaMap's own.",
  },
];

/**
 * The closing line, and the one sentence that states the product's intent in full.
 *
 * It is a denial and a promise, in that order: not what a body means, but what a person can say about it.
 * It claims nothing the product does not do, and it is not the fixed line - that one is rendered on every
 * screen by the shell, and is not restated anywhere.
 */
export const HOME_CLOSING =
  "The goal is not to tell you what your body means. It is to help you describe what you feel.";

/**
 * Product state, not report copy: what needs an account and what does not. It says nothing about what
 * happens to a person's words - that is the disclosure's job, on the screen where it applies.
 */
export const HOME_ACCOUNT_NOTE =
  "You can check in without an account. An account is what keeps a card in your journal.";

/**
 * The journal link's own line, so the journey is legible before the click.
 *
 * `/journal` sends a signed-out visitor to the sign-in screen, which is correct but unexplained; this
 * says the one thing that redirect would otherwise have to say for us - a saved journal needs an account.
 * It promises nothing about a check-in in progress, because a signed-out check-in is not kept anywhere,
 * and it says nothing about what happens to a person's words beyond that.
 */
export const HOME_JOURNAL_NOTE =
  "Your journal needs an account. Sign in, and the cards you finish are kept there.";

/**
 * Creating an account - the self-service half of the existing authentication.
 *
 * The failure lines are three different facts, and each is shown only for the state it describes: bad
 * input, a refusal from the account service, or a service that could not be reached. None of them claims
 * to know why an email was refused, because the account service does not say, and a screen that guessed
 * would be inventing a reason.
 *
 * There is deliberately no password-reset link: password reset is not implemented in this build, and a
 * link that led nowhere would be worse than its absence.
 */
export const SIGNUP_TITLE = "Create an account";
export const SIGNUP_INTRO = "An account keeps the cards you make, so you can come back to your own words.";
export const SIGNUP_EMAIL = "Email";
export const SIGNUP_PASSWORD = "Password";
export const SIGNUP_SUBMIT = "Create my account";
export const SIGNUP_INVALID = "Enter an email address and a password.";
export const SIGNUP_FAILED = "That email and password were not accepted. Check both, then try again.";
export const SIGNUP_UNAVAILABLE = "The account service could not be reached. Nothing was created. Try again.";
export const SIGNUP_NOT_CONFIGURED = "Accounts are not available in this deployment.";
export const SIGNUP_CONFIRM_TITLE = "Confirm your email";
export const SIGNUP_CONFIRM_BODY =
  "Your account was created. This deployment asks new accounts to confirm their email address before signing in.";
export const SIGNUP_CONFIRM_LINK = "Go to sign in";
export const SIGNUP_SIGNIN_PROMPT = "Already have an account? Sign in";
export const SIGNIN_SIGNUP_PROMPT = "New here? Create an account";

/** Sign-in - the minimum session the delete-everything action needs. */
export const SIGNIN_TITLE = "Sign in";
export const SIGNIN_INTRO = "Sign in to reach your settings.";
/** Shown while the form streams in: the destination it will use is read per request (`ISS-17`). */
export const SIGNIN_LOADING = "Getting the sign-in form ready...";
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

