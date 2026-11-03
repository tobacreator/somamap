import { NextResponse } from "next/server";

import { currentSession, supabaseTarget } from "@/lib/authSession";
import { savedCardFromPayload } from "@/lib/journal";
import { saveJournalCard } from "@/lib/journalStore";
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
 * What may be in the body: the card, and the map view the person was looking at. Nothing else is read.
 * The card is put through the strict five-field schema first, and then reduced to the user's own values
 * (`savedCardFromPayload`) - so interview answers, the provider's prompt and reply, the acknowledgement
 * and the processing mode have no path into the database even if a caller sends them.
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
  const config = resolution.target;

  const result = await saveJournalCard(
    {
      baseUrl: config.baseUrl,
      anonKey: config.anonKey,
      accessToken: session.accessToken,
      userId: session.userId,
    },
    card,
    view,
  );

  if (!result.ok) {
    // A category, never the row, the key or the upstream body.
    console.warn(`SomaMap journal write failed: ${result.detail}`);

    return NextResponse.json({ error: "not saved" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
