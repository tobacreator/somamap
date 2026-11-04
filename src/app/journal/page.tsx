import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import JournalCards from "@/components/JournalCards";
import Panel from "@/components/Panel";
import PaperPage from "@/components/PaperPage";
import Screen from "@/components/Screen";
import {
  JOURNAL_EMPTY_BODY,
  JOURNAL_EMPTY_TITLE,
  JOURNAL_INTRO,
  JOURNAL_LOAD_FAILED,
  JOURNAL_LOADING,
  JOURNAL_START_CHECKIN,
  JOURNAL_TITLE,
} from "@/lib/copy";
import { currentSession, supabaseTarget } from "@/lib/authSession";
import { listJournalCards } from "@/lib/journalStore";

/**
 * The journal - the user's own saved cards.
 *
 * Reached only with a session the Auth API has just verified; without one the reader is sent to the
 * sign-in screen, exactly as the settings screen does. The cards are read **as the user**: the request
 * carries their own token and no service key, so the row-level security in 001_init.sql answers with
 * their cards and nobody else's - there is no `user_id` filter in the query, because ownership is
 * derived from the parent session by the policy itself.
 *
 * The counts are computed from those same rows by the existing engine, and nothing on this screen
 * interprets them.
 */
export const metadata: Metadata = {
  title: "SomaMap - journal",
};

/** The signed-in part: it reads the session, so it streams in behind the boundary. */
async function JournalBody() {
  await connection();

  /**
   * The session is checked first, and the configuration second (`ISS-17`). The order used to be the
   * other way round, so on a deployment whose target could not be resolved an unauthenticated reader was
   * told the journal had failed to load - a configuration fact about the deployment - instead of being
   * sent to sign in. Nothing about the environment is read or reported before a verified session exists.
   *
   * The destination carries them back here after signing in, and it is a path this app serves: the
   * allow-list in `src/lib/signInDestination.ts` is what decides, so an edited query string cannot turn
   * the sign-in screen into a redirect anywhere else.
   */
  const session = await currentSession();

  if (!session) redirect("/sign-in?next=%2Fjournal");

  const resolution = supabaseTarget();

  if (!resolution.ok) {
    return (
      <p role="alert" className="text-body text-ink">
        {JOURNAL_LOAD_FAILED}
      </p>
    );
  }

  const result = await listJournalCards({
    baseUrl: resolution.target.baseUrl,
    anonKey: resolution.target.anonKey,
    accessToken: session.accessToken,
    userId: session.userId,
  });

  if (!result.ok) {
    // A category, never the row and never the user's words.
    console.warn(`SomaMap journal read failed: ${result.detail}`);

    return (
      <p role="alert" className="text-body text-ink">
        {JOURNAL_LOAD_FAILED}
      </p>
    );
  }

  if (result.records.length === 0) {
    return (
      <Panel>
        <h2 className="text-lead font-medium text-ink">{JOURNAL_EMPTY_TITLE}</h2>
        <p className="text-body leading-6 text-ink-muted">{JOURNAL_EMPTY_BODY}</p>
      </Panel>
    );
  }

  return <JournalCards records={result.records} />;
}

export default function JournalPage() {
  return (
    <PaperPage>
      <Screen>
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{JOURNAL_TITLE}</h1>
          <p className="text-body text-ink-muted">{JOURNAL_INTRO}</p>

          <Link
            href="/checkin"
            className="inline-flex min-h-11 items-center text-label font-medium text-accent-text underline"
          >
            {JOURNAL_START_CHECKIN}
          </Link>
        </header>

        <Suspense fallback={<p className="text-label text-ink-muted">{JOURNAL_LOADING}</p>}>
          <JournalBody />
        </Suspense>
      </Screen>
    </PaperPage>
  );
}
