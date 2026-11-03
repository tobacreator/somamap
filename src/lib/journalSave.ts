import { JOURNAL_CARD_SIGNED_OUT } from "./copy.ts";

/**
 * Whether a finished card may be written, and what the screen says when it may not (`ISS-17`).
 *
 * The check-in needs no account, so a person with no session can finish a card. Until now the screen
 * attempted the write regardless, took a 401, and showed the generic failure line - a request that
 * could not have succeeded, and a console error that said nothing to the person reading the screen.
 *
 * The decision is one line of policy, and it lives here rather than in the component for the reason
 * every other decision in this product does: so it can be exercised without a browser, and so there is
 * one place that answers "may this card be written?". The notice is the copy layer's own string, never
 * a sentence written at the call site.
 *
 * What this deliberately does not do: it does not claim the card was saved, it does not queue the card
 * for a later write, and it does not store it anywhere. The card stays on screen and the person is told
 * the truth about it.
 */
export type SaveIntent = { attempt: true } | { attempt: false; notice: string };

/** The intent for a finished card: write it when there is a session, say so plainly when there is not. */
export function saveIntentFor(signedIn: boolean): SaveIntent {
  return signedIn ? { attempt: true } : { attempt: false, notice: JOURNAL_CARD_SIGNED_OUT };
}
