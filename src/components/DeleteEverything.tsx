"use client";

import { useState } from "react";

import Button from "@/components/Button";
import Panel from "@/components/Panel";
import {
  DELETE_EVERYTHING_CANCEL,
  DELETE_EVERYTHING_CONFIRM,
  DELETE_EVERYTHING_DONE,
  DELETE_EVERYTHING_EXPLAIN,
  DELETE_EVERYTHING_LABEL,
  DELETE_EVERYTHING_NOT_READY,
  DELETE_EVERYTHING_NOT_READY_REASON,
  DELETE_EVERYTHING_PARTIAL,
  DELETE_EVERYTHING_RETRY,
  DELETE_EVERYTHING_RUNNING,
  DELETE_EVERYTHING_TARGET_HOST,
  DELETE_EVERYTHING_TARGET_HOSTED,
  DELETE_EVERYTHING_TARGET_LOCAL,
} from "@/lib/copy";

/**
 * The delete-everything switch - blueprint Chapter 6.1: "one confirmation, then rows and
 * storage objects go".
 *
 * The screen now says which project it will act on. That target is resolved on the server
 * from the same validated configuration the deletion route uses, and only its mode and
 * hostname reach the browser - never a key, a token or a cookie. When the configuration is
 * unusable or ambiguous the switch is **disabled**, so the button cannot be pressed against
 * a target nobody has confirmed.
 *
 * Phase B moved the surfaces onto the tokens and the shared panel and buttons. The destructive
 * control keeps its two-step shape: an outlined warning that starts the confirmation, then a filled
 * one that carries it out, with "Keep my data" beside it.
 */

export type DeleteTarget = { mode: "local" | "hosted"; host: string };

type Outcome = {
  ok: boolean;
  storage: { deleted: number; remaining: number; verifiedEmpty: boolean };
  rowsRemoved: boolean;
  accountPresent: boolean;
};

export default function DeleteEverything({ target, reason }: { target: DeleteTarget | null; reason: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const ready = target !== null;

  async function run() {
    if (!ready) return;

    setBusy(true);
    setOutcome(null);

    try {
      const response = await fetch("/api/delete-everything", { method: "POST" });
      const body = (await response.json()) as Outcome;

      setOutcome({ ...body, ok: body.ok === true });
    } catch {
      setOutcome(null);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <Panel>
      <h2 className="text-lead font-medium text-ink">{DELETE_EVERYTHING_LABEL}</h2>
      <p className="text-label leading-6 text-ink-muted">{DELETE_EVERYTHING_EXPLAIN}</p>

      {target ? (
        <p className="flex flex-col text-label text-ink">
          <span className="font-medium">
            {target.mode === "local" ? DELETE_EVERYTHING_TARGET_LOCAL : DELETE_EVERYTHING_TARGET_HOSTED}
          </span>
          <span className="text-ink-muted">
            {DELETE_EVERYTHING_TARGET_HOST}: {target.host}
          </span>
        </p>
      ) : (
        <p role="alert" className="flex flex-col text-label text-danger-text">
          <span className="font-medium">{DELETE_EVERYTHING_NOT_READY}</span>
          {reason ? (
            <span className="text-ink-muted">
              {DELETE_EVERYTHING_NOT_READY_REASON}: {reason}
            </span>
          ) : null}
        </p>
      )}

      {confirming ? (
        <div className="flex flex-col gap-2">
          <Button variant="dangerSolid" onClick={run} disabled={busy} className="self-start">
            {busy ? DELETE_EVERYTHING_RUNNING : DELETE_EVERYTHING_CONFIRM}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy} className="self-start">
            {DELETE_EVERYTHING_CANCEL}
          </Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)} disabled={!ready} className="self-start">
          {DELETE_EVERYTHING_LABEL}
        </Button>
      )}

      {outcome ? (
        <p role="status" className="text-label text-ink">
          {outcome.ok ? DELETE_EVERYTHING_DONE : DELETE_EVERYTHING_PARTIAL}
        </p>
      ) : null}

      {outcome && !outcome.ok ? (
        <Button variant="secondary" onClick={run} className="self-start">
          {DELETE_EVERYTHING_RETRY}
        </Button>
      ) : null}
    </Panel>
  );
}

