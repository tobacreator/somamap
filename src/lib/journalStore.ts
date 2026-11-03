import { isJournalCardRecord, type JournalCardRecord, type SavedCard } from "./journal.ts";

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

export type SaveJournalResult = { ok: true; id: string } | { ok: false; detail: string };

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

    return { ok: true, id };
  } catch (error) {
    return { ok: false, detail: `the card write failed (${errorName(error)})` };
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
