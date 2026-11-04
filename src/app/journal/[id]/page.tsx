import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import CardView from "@/components/CardView";
import Panel from "@/components/Panel";
import PaperPage from "@/components/PaperPage";
import SavedCardEditor from "@/components/SavedCardEditor";
import Screen from "@/components/Screen";
import { CARD_TITLE, JOURNAL_BACK, JOURNAL_LOAD_FAILED, JOURNAL_LOADING, JOURNAL_NOT_FOUND } from "@/lib/copy";
import { currentSession, supabaseTarget } from "@/lib/authSession";
import { cardPayloadFromRecord } from "@/lib/journal";
import { readJournalCardDetail } from "@/lib/journalStore";
import { sensationCardSchema } from "@/lib/schema";

/**
 * One saved card.
 *
 * The card is read as the user, with their own token and no service key, so the row-level security in
 * 001_init.sql decides whether it is theirs: another person's id answers with no row, and this screen
 * says the card is not here rather than that it exists and is forbidden. The stored five fields are
 * handed to `CardView` unchanged, which revalidates them against the strict schema, shows the reviewed
 * fallback if they do not pass, keeps the user's own sentence verbatim, and shows "Not answered yet" for
 * a field that was never answered rather than inventing a value - the duration row is left out entirely
 * while no duration was collected.
 *
 * `ISS-25`: the card used to be a dead end - readable, and nothing else - because the only editing in the
 * product lived in the interview screen, which can be reached only with the session that produced the
 * card and that session is not stored. The read below therefore also brings back the card's session and
 * the map view that session recorded, and `SavedCardEditor` uses them to update this row in place: the
 * person's own sentence and the place they feel it, with the other three fields handed on untouched.
 *
 * Every outcome renders inside this screen's shell, so the fixed line is on the page whichever way the
 * read goes. That is also why a missing card is a panel here rather than a framework 404: the 404 page
 * would be the one screen in the product without iron rule 5's line.
 */
export const metadata: Metadata = {
  title: "SomaMap - saved card",
};

/** The one way back, on every branch. */
function BackToJournal() {
  return (
    <Link
      href="/journal"
      className="inline-flex min-h-11 items-center text-label font-medium text-accent-text underline"
    >
      {JOURNAL_BACK}
    </Link>
  );
}

/** The signed-in part: it reads the session, so it streams in behind the boundary. */
async function SavedCardBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await connection();

  const resolution = supabaseTarget();

  if (!resolution.ok) {
    return (
      <Panel>
        <p role="alert" className="text-body text-ink">
          {JOURNAL_LOAD_FAILED}
        </p>
        <BackToJournal />
      </Panel>
    );
  }

  const session = await currentSession();

  if (!session) redirect("/sign-in");

  const result = await readJournalCardDetail(
    {
      baseUrl: resolution.target.baseUrl,
      anonKey: resolution.target.anonKey,
      accessToken: session.accessToken,
      userId: session.userId,
    },
    id,
  );

  if (!result.ok) {
    // A category, never the row and never the user's words.
    console.warn(`SomaMap saved-card read failed: ${result.detail}`);

    return (
      <Panel>
        <p role="alert" className="text-body text-ink">
          {JOURNAL_LOAD_FAILED}
        </p>
        <BackToJournal />
      </Panel>
    );
  }

  if (result.card === null) {
    return (
      <Panel>
        <p className="text-body text-ink">{JOURNAL_NOT_FOUND}</p>
        <BackToJournal />
      </Panel>
    );
  }

  const card = cardPayloadFromRecord(result.card.record);
  const view = result.card.view;
  /**
   * Whether this row may be offered for editing. Two things must hold: the session's own view had to be
   * readable (an edit would otherwise have to invent one), and the row must pass the strict five-field
   * schema the route puts every write through - a row that does not could never be saved back, and
   * offering an edit would promise something the write would refuse. Either way the card itself is still
   * shown, exactly as it was before this screen could edit anything.
   */
  const editable = view !== null && sensationCardSchema.safeParse(card).success;

  return (
    <>
      <CardView payload={card} />

      {editable && view !== null ? (
        <SavedCardEditor
          card={card}
          identity={{ cardId: result.card.record.id, sessionId: result.card.sessionId }}
          view={view}
        />
      ) : null}

      <BackToJournal />
    </>
  );
}

export default function SavedCardPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PaperPage>
      <Screen>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{CARD_TITLE}</h1>

        <Suspense fallback={<p className="text-label text-ink-muted">{JOURNAL_LOADING}</p>}>
          <SavedCardBody params={params} />
        </Suspense>
      </Screen>
    </PaperPage>
  );
}
