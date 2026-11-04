import { isJournalCardRecord, type CardIdentity, type JournalCardRecord, type SavedCard } from "./journal.ts";

/**
 * The journal's HTTP half - one module, injected `fetch`, as the user.
 *
 * Every request carries the publishable key as `apikey` and the signed-in user's access token as
 * `authorization`, exactly as the storage client does (`storageHttpClient.ts`). **No service key is
 * involved anywhere in this file**, so the row-level security in `supabase/migrations/001_init.sql`
 * decides what may be read and written: a card is reachable only when its parent session belongs to the
 * caller. Nothing here logs, returns or embeds a key, a token or a row of user text - a failure is a
 * status number or an error name.
 *
 * Why a session row first: `cards.session_id` is `not null` and references `public.sessions`, which is
 * where the owner lives (`sessions.user_id`), and the `sessions` insert policy requires that column to
 * equal `auth.uid()`. So one check-in writes one session and one card, which is the schema's own
 * meaning of a session ("one check-in"). PostgREST issues one statement per request, so the two inserts
 * are two requests: a failure between them leaves an empty session row - bookkeeping only, never shown,
 * and removed by delete-everything - and is reported as a failure rather than as success.
 */

/** The credentials a journal request travels with. The token belongs to the signed-in user. */
export type JournalConfig = {
  baseUrl: string;
  /** The publishable key. Public by design, still never logged. */
  anonKey: string;
  /** The signed-in user's access token. Never logged and never returned to a client. */
  accessToken: string;
  /** The user id from the verified session, never from a request body. */
  userId: string;
};

/** The columns a card is written with: the five content columns, plus the session it belongs to. */
export const CARD_COLUMNS = [
  "session_id",
  "location_label",
  "quality_words",
  "intensity_metaphor",
  "duration",
  "user_own_sentence",
] as const;

/** The columns read back. `created_at` is the date the journal orders and counts by. */
export const CARD_SELECT = "id,created_at,location_label,quality_words,intensity_metaphor,duration,user_own_sentence";

/** How many cards one journal read asks for. A cap, so a long journal cannot be read without bound. */
export const JOURNAL_PAGE_LIMIT = 200;

/**
 * The outcome of a journal write: the card's id **and** its session's, so the screen can address the same
 * row again when the card is re-worded (`ISS-24`), or a failure carrying a content-free detail for the
 * server log - never the row, the key or the upstream body.
 */
export type SaveJournalResult =
  | { ok: true; id: string; sessionId: string }
  | { ok: false; detail: string };

export type ListJournalResult =
  | { ok: true; records: readonly JournalCardRecord[] }
  | { ok: false; detail: string };

export type ReadJournalResult = { ok: true; record: JournalCardRecord | null } | { ok: false; detail: string };

/** The headers every request carries. Built once per call, never logged. */
function headersFor(config: JournalConfig, prefer: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: config.anonKey,
    authorization: `Bearer ${config.accessToken}`,
    "content-type": "application/json",
  };

  if (prefer !== null) headers.prefer = prefer;

  return headers;
}

/** The error's name only: never its message, which can echo request details. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

/**
 * Save one completed check-in: the session row, then the card.
 *
 * The card arrives already reduced to the user's own values (`savedCardFromPayload`), and the caller
 * validates the payload before it gets here. `view` is the map view the person was looking at, which the
 * schema requires on a session (`sessions_view_domain`); it is not part of the card.
 */
export async function saveJournalCard(
  config: JournalConfig,
  card: SavedCard,
  view: "front" | "back",
  fetchImpl: typeof fetch = fetch,
): Promise<SaveJournalResult> {
  let sessionId: string;

  try {
    const response = await fetchImpl(`${config.baseUrl}/rest/v1/sessions`, {
      method: "POST",
      headers: headersFor(config, "return=representation"),
      body: JSON.stringify({ user_id: config.userId, region_label: card.location_label, view }),
    });
    const text = await response.text();

    if (response.status !== 201) return { ok: false, detail: `the session write answered ${response.status}` };

    const value = JSON.parse(text) as unknown;
    const row = Array.isArray(value) ? value[0] : value;
    const id = row !== null && typeof row === "object" ? (row as { id?: unknown }).id : null;

    if (typeof id !== "string" || id.length === 0) return { ok: false, detail: "the session write returned no id" };

    sessionId = id;
  } catch (error) {
    return { ok: false, detail: `the session write failed (${errorName(error)})` };
  }

  try {
    const response = await fetchImpl(`${config.baseUrl}/rest/v1/cards`, {
      method: "POST",
      headers: headersFor(config, "return=representation"),
      body: JSON.stringify({ session_id: sessionId, ...card }),
    });
    const text = await response.text();

    if (response.status !== 201) return { ok: false, detail: `the card write answered ${response.status}` };

    const value = JSON.parse(text) as unknown;
    const row = Array.isArray(value) ? value[0] : value;
    const id = row !== null && typeof row === "object" ? (row as { id?: unknown }).id : null;

    if (typeof id !== "string" || id.length === 0) return { ok: false, detail: "the card write returned no id" };

    return { ok: true, id, sessionId };
  } catch (error) {
    return { ok: false, detail: `the card write failed (${errorName(error)})` };
  }
}

/**
 * Update one saved check-in: the session's bookkeeping, then the card's five fields (`ISS-24`).
 *
 * `Edit my answers` and `Change the region` rebuild a card from the answers the session already holds,
 * and a rebuild is not a second check-in: it must reach the row that already exists. This is that path,
 * and it is the insert path's mirror - the same two tables, the same allowlisted columns, the same
 * failure rule - with `PATCH` and an id in the query instead of `POST` and a new row.
 *
 *   - **the ids are validated first**, by the same uuid test the reader uses, so a value this build would
 *     not put in a query is refused before any request is made;
 *   - **the session is written first**, for the reason the insert path writes it first: a failure between
 *     the two then leaves the bookkeeping ahead of the card rather than the card ahead of the session that
 *     owns it. Either way the caller is told the write failed. The session's `region_label` and `view` are
 *     the only columns a rebuild can change; nothing else on the row is sent;
 *   - **the card keeps its id and its `session_id`.** The five content columns are sent exactly as the
 *     insert path sends them, and the session a card belongs to is never re-pointed;
 *   - **a row that does not come back is a failure, not a save.** PostgREST answers an update that matched
 *     no row with an empty representation rather than an error, and row-level security is what makes a row
 *     that is not this user's match nothing - so "no row came back" is the shape an unauthorized update
 *     takes. Reporting it as a failure is also what keeps this path useless for probing whether someone
 *     else's id exists: a row that is not theirs and a row that is not there answer the same way.
 */
export async function updateJournalCard(
  config: JournalConfig,
  card: SavedCard,
  view: "front" | "back",
  identity: CardIdentity,
  fetchImpl: typeof fetch = fetch,
): Promise<SaveJournalResult> {
  if (!isCardId(identity.cardId) || !isCardId(identity.sessionId)) {
    return { ok: false, detail: "the identity was not a pair of ids" };
  }

  try {
    const response = await fetchImpl(`${config.baseUrl}/rest/v1/sessions?id=eq.${identity.sessionId}`, {
      method: "PATCH",
      headers: headersFor(config, "return=representation"),
      body: JSON.stringify({ region_label: card.location_label, view }),
    });
    const text = await response.text();

    if (response.status !== 200) return { ok: false, detail: `the session update answered ${response.status}` };

    const value = JSON.parse(text) as unknown;
    const rows = Array.isArray(value) ? value : [];

    if (rows.length === 0) return { ok: false, detail: "the session update matched no row" };
  } catch (error) {
    return { ok: false, detail: `the session update failed (${errorName(error)})` };
  }

  try {
    const response = await fetchImpl(`${config.baseUrl}/rest/v1/cards?id=eq.${identity.cardId}`, {
      method: "PATCH",
      headers: headersFor(config, "return=representation"),
      body: JSON.stringify(card),
    });
    const text = await response.text();

    if (response.status !== 200) {
      return { ok: false, detail: `the card update answered ${response.status} after the session update landed` };
    }

    const value = JSON.parse(text) as unknown;
    const rows = Array.isArray(value) ? value : [];
    const row: unknown = rows[0];
    const id = row !== null && typeof row === "object" ? (row as { id?: unknown }).id : null;

    if (rows.length === 0) {
      return { ok: false, detail: "the card update matched no row after the session update landed" };
    }

    if (typeof id !== "string" || id.length === 0) return { ok: false, detail: "the card update returned no id" };

    return { ok: true, id, sessionId: identity.sessionId };
  } catch (error) {
    return { ok: false, detail: `the card update failed (${errorName(error)})` };
  }
}

/**
 * The signed-in user's own cards, newest first.
 *
 * There is deliberately no `user_id` filter in the query: cards have no such column, and the policy on
 * the table derives ownership from the parent session. Asking for every card and letting the database
 * answer with the caller's own is what makes another person's card unreachable rather than merely
 * unasked-for.
 */
export async function listJournalCards(
  config: JournalConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ListJournalResult> {
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/cards?select=${CARD_SELECT}&order=created_at.desc&limit=${JOURNAL_PAGE_LIMIT}`,
      { method: "GET", headers: headersFor(config, null) },
    );
    const text = await response.text();

    if (response.status !== 200) return { ok: false, detail: `the journal read answered ${response.status}` };

    const value = JSON.parse(text) as unknown;

    if (!Array.isArray(value)) return { ok: false, detail: "the journal read was not a list" };

    const records: JournalCardRecord[] = [];

    for (const item of value) {
      if (!isJournalCardRecord(item)) return { ok: false, detail: "a saved row was not a card this build can read" };

      records.push(item);
    }

    return { ok: true, records };
  } catch (error) {
    return { ok: false, detail: `the journal read failed (${errorName(error)})` };
  }
}

/** A card id this build will put in a query: a uuid, and nothing else. */
export function isCardId(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

/**
 * One card by id, or null when this user has no such card.
 *
 * The id is validated before it reaches the query, and the answer is subject to the same policy as the
 * list: another user's card comes back as an empty list, which the caller shows as "not here" rather
 * than as a denial, so the screen cannot be used to test whether someone else's id exists.
 */
export async function readJournalCard(
  config: JournalConfig,
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadJournalResult> {
  if (!isCardId(id)) return { ok: true, record: null };

  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/cards?select=${CARD_SELECT}&id=eq.${id}&limit=1`,
      { method: "GET", headers: headersFor(config, null) },
    );
    const text = await response.text();

    if (response.status !== 200) return { ok: false, detail: `the card read answered ${response.status}` };

    const value = JSON.parse(text) as unknown;

    if (!Array.isArray(value)) return { ok: false, detail: "the card read was not a list" };
    if (value.length === 0) return { ok: true, record: null };
    if (!isJournalCardRecord(value[0])) return { ok: false, detail: "the saved row was not a card this build can read" };

    return { ok: true, record: value[0] };
  } catch (error) {
    return { ok: false, detail: `the card read failed (${errorName(error)})` };
  }
}

/**
 * The columns a saved card's own page reads: the five content columns plus the session the card belongs
 * to (`ISS-25`).
 *
 * The session id is what an edit needs to address the row that already exists (`ISS-24`). The view that
 * session recorded is a second, small read of its own (`readSessionView`) rather than an embedded select,
 * because it is allowed to fail: a card whose session cannot be read is still shown exactly as it was
 * before this work, and only the editor is withheld.
 */
export const CARD_DETAIL_SELECT = `${CARD_SELECT},session_id`;

/**
 * One saved card with what its own page needs: the record, its session, and that session's view.
 *
 * `view` is null when the session's own row could not be read. The page then shows the card and no
 * editor - never a guessed view, because a view the person never had is worse than no editor at all.
 */
export type JournalCardDetail = {
  record: JournalCardRecord;
  sessionId: string;
  view: "front" | "back" | null;
};

export type ReadJournalDetailResult =
  | { ok: true; card: JournalCardDetail | null }
  | { ok: false; detail: string };

/**
 * The view one session recorded, or null when it cannot be read. Never a guess, and never an error: this
 * is the one part of the card's page that is allowed to be missing.
 */
async function readSessionView(
  config: JournalConfig,
  sessionId: string,
  fetchImpl: typeof fetch,
): Promise<"front" | "back" | null> {
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/sessions?select=view&id=eq.${sessionId}&limit=1`,
      { method: "GET", headers: headersFor(config, null) },
    );

    if (response.status !== 200) return null;

    const value = JSON.parse(await response.text()) as unknown;

    if (!Array.isArray(value) || value.length === 0) return null;

    const view = (value[0] as { view?: unknown }).view;

    return view === "front" || view === "back" ? view : null;
  } catch {
    return null;
  }
}

/**
 * One card with its identity, or null when this user has no such card.
 *
 * The same rules as `readJournalCard`: the id is validated before it reaches a query, the answer is the
 * caller's own rows or nothing, and a row this build cannot read is a failure rather than something to be
 * shown. The session read is the one exception, and it degrades rather than fails - the card is the
 * person's record and it must render whether or not the editor can be offered.
 */
export async function readJournalCardDetail(
  config: JournalConfig,
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadJournalDetailResult> {
  if (!isCardId(id)) return { ok: true, card: null };

  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/cards?select=${CARD_DETAIL_SELECT}&id=eq.${id}&limit=1`,
      { method: "GET", headers: headersFor(config, null) },
    );
    const text = await response.text();

    if (response.status !== 200) return { ok: false, detail: `the card read answered ${response.status}` };

    const value = JSON.parse(text) as unknown;

    if (!Array.isArray(value)) return { ok: false, detail: "the card read was not a list" };
    if (value.length === 0) return { ok: true, card: null };

    const row: unknown = value[0];

    if (!isJournalCardRecord(row)) return { ok: false, detail: "the saved row was not a card this build can read" };

    const carried = (row as { session_id?: unknown }).session_id;
    const sessionId = typeof carried === "string" ? carried : "";
    const view = isCardId(sessionId) ? await readSessionView(config, sessionId, fetchImpl) : null;

    return { ok: true, card: { record: row, sessionId, view } };
  } catch (error) {
    return { ok: false, detail: `the card read failed (${errorName(error)})` };
  }
}
