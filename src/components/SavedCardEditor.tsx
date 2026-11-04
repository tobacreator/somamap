"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import BodyMap from "@/components/BodyMap";
import Button from "@/components/Button";
import TextField from "@/components/TextField";
import {
  CARD_EDIT_CANCEL,
  CARD_EDIT_FAILED,
  CARD_EDIT_NOTE,
  CARD_EDIT_OPEN,
  CARD_EDIT_REGION_HINT,
  CARD_EDIT_REGION_LABEL,
  CARD_EDIT_REGION_PLACEHOLDER,
  CARD_EDIT_SAVE,
  CARD_EDIT_SAVED,
  CARD_EDIT_SAVING,
  CARD_EDIT_SENTENCE_HINT,
  CARD_EDIT_SENTENCE_LABEL,
} from "@/lib/copy";
import { cardWithEdits, saveEditedCard } from "@/lib/cardEdit";
import type { CardIdentity, SavedCard } from "@/lib/journal";
import type { BodyView } from "@/lib/regions";

/**
 * Editing a card that is already in the journal (`ISS-25`).
 *
 * The card above this control is the stored one, rendered by `CardView` from the row the server read.
 * This is the way to change it, and it is deliberately small: the person's own sentence and the place
 * they feel it, saved through the journal route's update path so the row they are looking at is the row
 * that changes.
 *
 * Three properties are the whole design:
 *
 *   - **the identity comes from the page, not from the person.** `cardId` and `sessionId` were read with
 *     the card by the server, so an edit addresses the row the card already occupies (`ISS-24`) and can
 *     never name another one;
 *   - **nothing else moves.** The three fields this screen does not offer travel to the route exactly as
 *     they are stored (`cardWithEdits`), so the words the person chose, their comparison and the
 *     duration cannot be rewritten by a change to their sentence;
 *   - **the screen never claims a save it did not get.** A write that did not land leaves the card as it
 *     was, says so in as many words, and keeps what the person typed so they can try again. Only a
 *     confirmed update - a 200 naming the same card - refreshes the page.
 */
export default function SavedCardEditor({
  card,
  identity,
  view,
}: {
  card: SavedCard;
  identity: CardIdentity;
  view: BodyView;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [sentence, setSentence] = useState(card.user_own_sentence);
  const [region, setRegion] = useState(card.location_label);
  const [mapView, setMapView] = useState<BodyView>(view);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const busy = state === "saving";

  /** Open the editor on what is stored now, whatever happened last time. */
  function open() {
    setSentence(card.user_own_sentence);
    setRegion(card.location_label);
    setMapView(view);
    setState("idle");
    setEditing(true);
  }

  async function save() {
    if (busy) return;

    setState("saving");

    const outcome = await saveEditedCard(identity, cardWithEdits(card, { sentence, region }), mapView);

    if (!outcome.ok) {
      setState("failed");

      return;
    }

    setState("saved");
    setEditing(false);
    // The card above is rendered by the server from the row that was just written, so a refresh is what
    // makes the page show the stored values rather than the ones it read a moment ago.
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Button onClick={open}>{CARD_EDIT_OPEN}</Button>
        </div>

        {state === "saved" ? (
          <p role="status" className="text-body leading-6 text-ink">
            {CARD_EDIT_SAVED}
          </p>
        ) : null}

        {state === "failed" ? (
          <p role="alert" className="text-body leading-6 text-ink">
            {CARD_EDIT_FAILED}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body leading-6 text-ink-muted">{CARD_EDIT_NOTE}</p>

      <TextField
        id="card-edit-sentence"
        label={CARD_EDIT_SENTENCE_LABEL}
        value={sentence}
        onChange={setSentence}
        multiline
        rows={3}
        hint={CARD_EDIT_SENTENCE_HINT}
        disabled={busy}
      />

      <TextField
        id="card-edit-region"
        label={CARD_EDIT_REGION_LABEL}
        value={region}
        onChange={setRegion}
        placeholder={CARD_EDIT_REGION_PLACEHOLDER}
        hint={CARD_EDIT_REGION_HINT}
        disabled={busy}
      />

      {/* The same fixed map the check-in uses, opening on the region the card already names. The field
          above stays the source of truth, so a person who taps "chest" and then types "upper chest" is
          not contradicted by the map - the same rule the check-in screen follows. */}
      <BodyMap
        initialLabel={card.location_label}
        readoutLabel={region}
        onRegionChange={(label) => setRegion(label ?? "")}
        onViewChange={setMapView}
      />

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? CARD_EDIT_SAVING : CARD_EDIT_SAVE}
        </Button>

        <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
          {CARD_EDIT_CANCEL}
        </Button>
      </div>

      {busy ? (
        <p role="status" className="text-meta text-ink-muted">
          {CARD_EDIT_SAVING}
        </p>
      ) : null}

      {state === "failed" ? (
        <p role="alert" className="text-body leading-6 text-ink">
          {CARD_EDIT_FAILED}
        </p>
      ) : null}
    </div>
  );
}
