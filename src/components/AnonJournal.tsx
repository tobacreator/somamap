"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import Button from "@/components/Button";
import JournalCards from "@/components/JournalCards";
import Panel from "@/components/Panel";
import {
  ANON_JOURNAL_EMPTY_BODY,
  ANON_JOURNAL_EMPTY_TITLE,
  ANON_JOURNAL_INTRO,
  ANON_JOURNAL_KEEP_BODY,
  ANON_JOURNAL_KEEP_TITLE,
  ANON_JOURNAL_SIGN_IN,
  ANON_JOURNAL_TITLE,
  ANON_TRANSFER_BODY,
  ANON_TRANSFER_DONE,
  ANON_TRANSFER_FAILED,
  ANON_TRANSFER_KEEP,
  ANON_TRANSFER_PARTIAL,
  ANON_TRANSFER_SAVE,
  ANON_TRANSFER_SAVING,
  ANON_TRANSFER_TITLE,
  JOURNAL_START_CHECKIN,
} from "@/lib/copy";
import { readAnonJournal, removeAnonCards, tabStorage, type AnonCard } from "@/lib/anonJournal";
import { cardPayloadFromRecord } from "@/lib/journal";

/**
 * The in-session journal, and the one way it becomes a saved one (`ISS-28`).
 *
 * Two jobs, one component, because they are the same subject from two sides:
 *
 *   - **signed out** it shows the cards this tab is holding, says plainly that they are not saved
 *     anywhere else and go when the tab closes, and offers the way to keep them. This is the whole point
 *     of the product decision: a visitor can finish a check-in, make several cards and read their journal
 *     without an account.
 *   - **signed in** it offers to move those cards into the account - and only when the person says yes.
 *     Nothing is written to a database before that click, and that button is the only thing on this screen
 *     that writes anything.
 *
 * The store is read in an effect rather than during render, so the server-rendered page and the first
 * client render agree (the server has no tab to read), and nothing is shown until the real list is known.
 *
 * A transfer is one write per card, so it can partly succeed. It removes **exactly** the cards that landed,
 * which is what makes a second attempt safe: the next run can only send what is still here, so nothing is
 * ever written twice. A failure keeps everything on screen and says so.
 */
/**
 * The three pieces `useSyncExternalStore` needs.
 *
 * The snapshot is cached so React sees the same reference while nothing has changed: it compares by
 * identity, and a fresh array on every render would loop. The comparison is by card id, which is all this
 * screen re-renders for.
 *
 * `subscribeToTab` has nothing to listen to, and says so rather than pretending: `storage` events do not
 * fire in the tab that wrote them, and this store has exactly one writer - the interview's completion and
 * the transfer on this screen. Every write is followed by a state change on this component, which is what
 * re-reads the snapshot.
 */
let snapshotCache: readonly AnonCard[] | null = null;

function subscribeToTab(): () => void {
  return () => {};
}

function tabSnapshot(): readonly AnonCard[] | null {
  const next = readAnonJournal(tabStorage());

  if (
    snapshotCache === null ||
    snapshotCache.length !== next.length ||
    snapshotCache.some((card, index) => card.id !== next[index].id)
  ) {
    snapshotCache = next;
  }

  return snapshotCache;
}

/** The server has no tab to read: null means "not known yet", and nothing is rendered from it. */
function serverSnapshot(): readonly AnonCard[] | null {
  return null;
}

export default function AnonJournal({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  /**
   * The list, read the way React asks for state that lives outside React - which is exactly what a browser
   * tab's storage is. `useSyncExternalStore` gives the server render its own snapshot (`null`, meaning "no
   * tab to read"), so the markup the server sends and the first client render agree, and the real list
   * arrives on the next render without a mismatch and without setting state from an effect.
   */
  const cards = useSyncExternalStore(subscribeToTab, tabSnapshot, serverSnapshot);
  const [transfer, setTransfer] = useState<"idle" | "saving" | "done" | "partial" | "failed">("idle");
  /** Set when the person says "leave them for now": the offer goes, the cards stay where they are. */
  const [dismissed, setDismissed] = useState(false);

  /** One card, through the journal route, as the signed-in user. The route decides what may be written. */
  async function postCard(record: AnonCard): Promise<boolean> {
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ card: cardPayloadFromRecord(record), view: record.view }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async function saveThem(): Promise<void> {
    if (cards === null || cards.length === 0 || transfer === "saving") return;

    setTransfer("saving");

    const landed: string[] = [];

    for (const record of cards) {
      // Stop at the first failure: what landed has landed, and the rest is untouched.
      if (!(await postCard(record))) break;

      landed.push(record.id);
    }

    const left = removeAnonCards(tabStorage(), landed);

    // No `setCards`: the snapshot is read from the store on the next render, and the state change below
    // is what causes it. What is left is exactly what did not land.
    if (left.length === 0) {
      setTransfer("done");
      // The list above this panel is rendered by the server from the rows just written.
      router.refresh();

      return;
    }

    setTransfer(landed.length === 0 ? "failed" : "partial");
  }

  if (cards === null) return null;

  if (signedIn) {
    if (dismissed || cards.length === 0) return null;

    return (
      <Panel className="flex flex-col gap-3">
        <h2 className="text-lead font-medium text-ink">{ANON_TRANSFER_TITLE}</h2>
        <p className="text-body leading-6 text-ink-muted">{ANON_TRANSFER_BODY}</p>

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void saveThem()} disabled={transfer === "saving"}>
            {transfer === "saving" ? ANON_TRANSFER_SAVING : ANON_TRANSFER_SAVE}
          </Button>

          <Button variant="secondary" onClick={() => setDismissed(true)} disabled={transfer === "saving"}>
            {ANON_TRANSFER_KEEP}
          </Button>
        </div>

        {transfer === "done" ? <p className="text-body leading-6 text-ink">{ANON_TRANSFER_DONE}</p> : null}
        {transfer === "partial" ? (
          <p role="status" className="text-body leading-6 text-ink">
            {ANON_TRANSFER_PARTIAL}
          </p>
        ) : null}
        {transfer === "failed" ? (
          <p role="alert" className="text-body leading-6 text-ink">
            {ANON_TRANSFER_FAILED}
          </p>
        ) : null}
      </Panel>
    );
  }

  return (
    <>
      <section aria-labelledby="anon-journal" className="flex flex-col gap-2">
        <h2 id="anon-journal" className="text-lead font-medium text-ink">
          {ANON_JOURNAL_TITLE}
        </h2>
        <p className="text-body leading-6 text-ink-muted">{ANON_JOURNAL_INTRO}</p>
      </section>

      {cards.length === 0 ? (
        <Panel className="flex flex-col gap-3">
          <h3 className="text-lead font-medium text-ink">{ANON_JOURNAL_EMPTY_TITLE}</h3>
          <p className="text-body leading-6 text-ink-muted">{ANON_JOURNAL_EMPTY_BODY}</p>

          <Link
            href="/checkin"
            className="inline-flex min-h-11 items-center self-start text-label font-medium text-accent-text underline"
          >
            {JOURNAL_START_CHECKIN}
          </Link>
        </Panel>
      ) : (
        <>
          <JournalCards records={cards} />

          <Panel className="flex flex-col gap-3">
            <h3 className="text-lead font-medium text-ink">{ANON_JOURNAL_KEEP_TITLE}</h3>
            <p className="text-body leading-6 text-ink-muted">{ANON_JOURNAL_KEEP_BODY}</p>

            <Link
              href="/sign-in?next=%2Fjournal"
              className="inline-flex min-h-11 items-center self-start text-label font-medium text-accent-text underline"
            >
              {ANON_JOURNAL_SIGN_IN}
            </Link>
          </Panel>
        </>
      )}
    </>
  );
}
