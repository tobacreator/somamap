import { isJournalCardRecord, type JournalCardRecord, type SavedCard } from "./journal.ts";
import type { BodyView } from "./regions.ts";

/**
 * The in-session journal (`ISS-28`) - the cards a person makes without an account.
 *
 * The product decision: a visitor must be able to finish a check-in, get a card, and look at their
 * journal without creating an account. Signing in is for *keeping* the journal, not for using the product.
 *
 * Where the cards live, and why: **this browser tab's `sessionStorage`**. Nothing is sent to the server,
 * nothing is written to the database, and no cookie is set - the interview route still touches no database
 * at all, so an anonymous check-in leaves no row anywhere. The store is read and written only in the
 * browser, which is what makes "we do not silently persist your descriptions" true by construction rather
 * than by promise.
 *
 * Why `sessionStorage` and not the alternatives:
 *
 *   - `localStorage` outlives the tab and the browser, so a card would look saved when it is not, and a
 *     shared device would keep someone's words after they walked away. Both are wrong for words this
 *     personal.
 *   - a database row would be exactly the silent persistence the product decision forbids.
 *   - a cookie would be sent to the server on every request, which is the opposite of keeping it local.
 *
 * What it costs, stated plainly in the copy: the cards are gone when the tab closes, and a person who
 * wants them kept has to sign in. An unfinished check-in is not held here either - the interview is screen
 * state - so only finished cards are ever stored.
 *
 * The module is pure and takes its storage as an argument, so every path is tested with a fake storage and
 * no browser. Every value read back is validated (`isJournalCardRecord`) and a value that does not fit is
 * dropped rather than shown, so a changed format cannot render as a card.
 */

/** The one key this store uses. Versioned, so a future format can be told apart rather than guessed at. */
export const ANON_JOURNAL_KEY = "somamap.anon-journal.v1";

/** The format version inside the stored value. A value from another version is ignored, never migrated. */
const VERSION = 1;

/** The most cards this store keeps. A demo journal is a handful; this is only a bound. */
export const ANON_JOURNAL_LIMIT = 50;

/** The storage this module needs. `sessionStorage` satisfies it; a test passes its own. */
export type AnonStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * A card as this store keeps it: the same shape the saved journal uses, so the same list component and the
 * same counting engine render both without a second code path - plus the map view the person was looking at
 * when they checked in.
 *
 * The view is kept because a card that is later moved into an account has to be written through the same
 * journal route, and that route records a view on the session row. Without it, a transfer would have to
 * invent one, and a view the person never had is worse than not offering the transfer at all.
 *
 * `id` is local. It is **not** a database id - the server mints those when a card is actually saved - and
 * it exists so a transfer can name exactly which cards landed and remove only those.
 */
export type AnonCard = JournalCardRecord & { view: BodyView };

/**
 * A local id for an in-session card.
 *
 * Prefixed `anon-` on purpose: it can never be mistaken for a row id, and nothing sends it to the server.
 * `crypto.randomUUID` is used when the browser offers it; the fallback is still random enough for a
 * handful of cards in one tab.
 */
export function newAnonCardId(now: number, random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 0x100000000).toString(36);

  return `anon-${now.toString(36)}-${suffix}`;
}

/** The stored card for a finished card: its five fields, the view it was made in, the moment, and a local id. */
export function anonCardFrom(
  card: SavedCard,
  view: BodyView,
  now: number,
  random: () => number = Math.random,
): AnonCard {
  return {
    id: newAnonCardId(now, random),
    created_at: new Date(now).toISOString(),
    location_label: card.location_label,
    quality_words: [...card.quality_words],
    intensity_metaphor: card.intensity_metaphor,
    duration: card.duration,
    user_own_sentence: card.user_own_sentence,
    view,
  };
}

/** True only for a stored entry this build can render and transfer: a card record with a readable view. */
function isAnonCard(value: unknown): value is AnonCard {
  if (!isJournalCardRecord(value)) return false;

  const view = (value as { view?: unknown }).view;

  return view === "front" || view === "back";
}

/**
 * The cards this tab is holding, newest first.
 *
 * Nothing is repaired and nothing is guessed at: a value that is missing, unparseable, of another version,
 * or not a list of card-shaped records yields no cards. Losing an in-session card to a corrupt value is a
 * smaller failure than rendering a changed format as if it were a person's card.
 */
export function readAnonJournal(storage: AnonStorage | null): readonly AnonCard[] {
  if (storage === null) return [];

  let parsed: unknown;

  try {
    const raw = storage.getItem(ANON_JOURNAL_KEY);

    if (raw === null) return [];

    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const { version, cards } = parsed as { version?: unknown; cards?: unknown };

  if (version !== VERSION) return [];
  if (!Array.isArray(cards)) return [];

  return cards.filter(isAnonCard).slice(0, ANON_JOURNAL_LIMIT);
}

/**
 * Write the list back. A storage that refuses (full, or switched off) leaves the list as it was on screen:
 * the card is still in front of the person, and the failure is not turned into a lost card.
 */
function writeAnonJournal(storage: AnonStorage | null, cards: readonly AnonCard[]): void {
  if (storage === null) return;

  try {
    storage.setItem(ANON_JOURNAL_KEY, JSON.stringify({ version: VERSION, cards }));
  } catch {
    // Deliberately silent: there is nothing useful to say to a person whose browser refused to store
    // something, and the card they just made is still on screen.
  }
}

/** Add a finished card to the front of the list, and answer with what the storage actually holds. */
export function addAnonCard(storage: AnonStorage | null, card: AnonCard): readonly AnonCard[] {
  const next = [card, ...readAnonJournal(storage)].slice(0, ANON_JOURNAL_LIMIT);

  writeAnonJournal(storage, next);

  /**
   * Read back rather than assume. A storage that refused - full, or switched off - leaves the list as it
   * was, and the caller can then tell the person the truth about where their card is instead of promising
   * a journal the browser would not keep.
   */
  return readAnonJournal(storage);
}

/**
 * Remove the cards that landed somewhere else (`ISS-28`'s transfer), and answer with what is left.
 *
 * Removing exactly the ids that succeeded is what makes a retry safe: a second attempt can only send the
 * cards that did not make it, so nothing is written twice.
 */
export function removeAnonCards(storage: AnonStorage | null, ids: readonly string[]): readonly AnonCard[] {
  const kept = readAnonJournal(storage).filter((card) => !ids.includes(card.id));

  writeAnonJournal(storage, kept);

  return readAnonJournal(storage);
}

/** Forget everything this tab was holding. */
export function clearAnonJournal(storage: AnonStorage | null): void {
  if (storage === null) return;

  try {
    storage.removeItem(ANON_JOURNAL_KEY);
  } catch {
    // Same as writing: a storage that refuses changes nothing on screen.
  }
}

/**
 * The tab's own storage, or null when there is none.
 *
 * Null is the honest answer on the server (where there is no `window`) and in a browser that refuses
 * storage - Safari in private mode has thrown on this access - and every function above treats null as
 * "hold nothing", which is the safe direction.
 */
export function tabStorage(): AnonStorage | null {
  try {
    if (typeof window === "undefined") return null;

    return window.sessionStorage;
  } catch {
    return null;
  }
}

