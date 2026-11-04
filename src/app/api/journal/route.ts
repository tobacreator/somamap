import { NextResponse } from "next/server";

import { currentSession, supabaseTarget } from "@/lib/authSession";
import { savedCardFromPayload, type CardIdentity } from "@/lib/journal";
import { isCardId, saveJournalCard, updateJournalCard } from "@/lib/journalStore";
import { sensationCardSchema } from "@/lib/schema";

/**
 * Save one completed card - the journal's only write.
 *
 * Security shape, in the order it matters, and the same shape the deletion route uses:
 *   - the caller must have a session the Auth API has just verified, checked first, so an
 *     unauthenticated request learns nothing about this server's configuration;
 *   - the target must be validated (src/lib/supabaseTarget.ts), so an ambiguous environment writes
 *     nowhere;
 *   - the user id comes from that verified session, never from the request body;
 *   - the write carries the user's own token, so the row-level security in 001_init.sql decides what
 *     may be written - no service key is used anywhere;
 *   - the response carries an outcome and, on success, the new card's id. Never a key, a token or a row
 *     of user text.
 *
 * What may be in the body: the card, the map view the person was looking at, and - when the card is
 * already in the journal - the two ids that name it (`ISS-24`). Nothing else is read. The card is put
 * through the strict five-field schema first, and then reduced to the user's own values
 * (`savedCardFromPayload`) - so interview answers, the provider's prompt and reply, the acknowledgement
 * and the processing mode have no path into the database even if a caller sends them.
 *
 * **Two write paths, one shape.** With no ids this is a new check-in: a session row and a card row are
 * inserted, exactly as before. With both ids it is a rebuild of a card that already exists - `Edit my
 * answers` or `Change the region` - and the same two rows are **updated in place**, so the journal keeps
 * one entry per check-in instead of gaining one per rebuild. The ids are validated as uuids here and
 * again in the store, and they are never taken as a claim about ownership: the write carries the user's
 * own token, so the row-level security in 001_init.sql decides, and a row that is not theirs matches
 * nothing and is reported as a failed write rather than as a save.
 *
 * A failed write is answered as a failure. There is no path in this route that reports success when the
 * rows did not land.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await currentSession();

  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const resolution = supabaseTarget();

  if (!resolution.ok) {
    return NextResponse.json({ error: "not configured", reason: resolution.reason }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const record = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const parsed = sensationCardSchema.safeParse(record.card);

  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const card = savedCardFromPayload(parsed.data);

  if (card === null) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  // The map view is bookkeeping on the session row, not part of the card. Only the two views the schema
  // allows are accepted: anything else is refused rather than guessed, so the column can never record a
  // view the person did not have.
  if (record.view !== "front" && record.view !== "back") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const view = record.view;

  /**
   * The identity, when the caller says this card is already in the journal (`ISS-24`). Both ids or
   * neither: a half identity cannot address a row, so it is refused rather than guessed at, and a value
   * that is not a uuid never reaches a query. The ids say which row the caller means, never who owns it.
   */
  const claimsIdentity = record.cardId !== undefined || record.sessionId !== undefined;
  const cardId = typeof record.cardId === "string" ? record.cardId : null;
  const sessionId = typeof record.sessionId === "string" ? record.sessionId : null;
  const identity: CardIdentity | null =
    cardId !== null && sessionId !== null && isCardId(cardId) && isCardId(sessionId) ? { cardId, sessionId } : null;

  if (claimsIdentity && identity === null) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const config = resolution.target;

  const result =
    identity === null
      ? await saveJournalCard(
          {
            baseUrl: config.baseUrl,
            anonKey: config.anonKey,
            accessToken: session.accessToken,
            userId: session.userId,
          },
          card,
          view,
        )
      : await updateJournalCard(
          {
            baseUrl: config.baseUrl,
            anonKey: config.anonKey,
            accessToken: session.accessToken,
            userId: session.userId,
          },
          card,
          view,
          identity,
        );

  if (!result.ok) {
    // A category, never the row, the key or the upstream body.
    console.warn(`SomaMap journal write failed: ${result.detail}`);

    return NextResponse.json({ error: "not saved" }, { status: 500 });
  }

  // 201 when a card was created, 200 when an existing one was updated - and the same two ids either way,
  // so the screen can address this row again if the card is re-worded.
  return NextResponse.json(
    { ok: true, id: result.id, sessionId: result.sessionId },
    { status: identity === null ? 201 : 200 },
  );
}
