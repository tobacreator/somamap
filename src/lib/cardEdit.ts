import type { CardIdentity, SavedCard } from "./journal.ts";
import type { BodyView } from "./regions.ts";

/**
 * Editing a saved card (`ISS-25`) - the pure half and the write.
 *
 * A card in the journal used to be a dead end: the only editing lived in the interview screen, which
 * can only be reached with the session that produced the card, and that session is not stored. So a
 * person who opened their own card could read it and go back - nothing else.
 *
 * This module is the focused alternative, and it is deliberately narrow. It changes the two things a
 * person can revise without being asked anything again:
 *
 *   - **their own sentence** - the row the card calls "In your words", which is the whole point of the
 *     product and the thing most likely to be wrong the first time, especially when they started from
 *     "I don't know how to describe it";
 *   - **where they feel it** - the region, which is a tap on the same fixed map the check-in uses.
 *
 * The other three fields - the words they chose, the comparison they gave, the duration - are handed on
 * **exactly as they are stored**. Nothing here paraphrases, reorders, improves or invents: the sentence
 * travels as typed, and a field nobody touched travels as it was.
 *
 * Why not the interview: the interview's own editing re-runs the questions with the answers the session
 * holds, and those answers are not in the database. Rebuilding them from the card would mean inventing
 * answers the person never gave, which is exactly what iron rule 4 forbids. So the interview keeps its
 * own editing for a session still in progress, and a saved card gets this one.
 */

/** What the focused editor can change. */
export type CardEdits = { sentence: string; region: string };

/**
 * The card to write: the stored card with the two edited fields replaced, everything else untouched.
 *
 * The words are copied rather than aliased so the value handed to the network cannot be mutated by a
 * later render, and the three fields nobody edited are passed through by reference, which is the
 * strongest statement this code can make that it does not touch them.
 */
export function cardWithEdits(card: SavedCard, edits: CardEdits): SavedCard {
  return {
    location_label: edits.region,
    quality_words: [...card.quality_words],
    intensity_metaphor: card.intensity_metaphor,
    duration: card.duration,
    user_own_sentence: edits.sentence,
  };
}

export type EditOutcome = { ok: true } | { ok: false; detail: string };

/**
 * Save an edit to a card that already exists: the journal route's **update** path (`ISS-24`).
 *
 * The body carries the card, the map view the person is looking at, and the two ids that name the row.
 * The ids are what make this an update rather than a new entry, and they come from the page's own read
 * of the card - never from anything the person typed.
 *
 * **Only 200 is success.** A create answers 201, so a reply of 201 would mean this write added a card
 * instead of changing one - a duplicate for one check-in, which is the defect `ISS-24` fixed. Treating
 * it as a failure rather than as a save means that, if it ever happened, the screen would say the change
 * did not save rather than quietly leaving two cards behind.
 *
 * A refusal, a transport failure or a reply this build does not understand is a failure, and the detail
 * is a category for the console - never the row, and never the person's words.
 */
export async function saveEditedCard(
  identity: CardIdentity,
  card: SavedCard,
  view: BodyView,
  fetchImpl: typeof fetch = fetch,
): Promise<EditOutcome> {
  try {
    const response = await fetchImpl("/api/journal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        card,
        view,
        cardId: identity.cardId,
        sessionId: identity.sessionId,
      }),
    });

    if (response.status === 201) return { ok: false, detail: "the route created a card instead of updating one" };
    if (response.status !== 200) return { ok: false, detail: `the update answered ${response.status}` };

    const payload = (await response.json()) as { id?: unknown; sessionId?: unknown };
    const id = typeof payload.id === "string" ? payload.id : "";

    // The reply must name the same card. A different id would mean the write reached another row.
    if (id.length === 0) return { ok: false, detail: "the update returned no id" };
    if (id !== identity.cardId) return { ok: false, detail: "the update returned a different card id" };

    return { ok: true };
  } catch (error) {
    return { ok: false, detail: `the update failed (${error instanceof Error ? error.name : "unknown"})` };
  }
}
