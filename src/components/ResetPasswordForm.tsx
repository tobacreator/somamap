"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import Button from "@/components/Button";
import Panel from "@/components/Panel";
import TextField from "@/components/TextField";
import {
  RESET_CONFIRM,
  RESET_EXPIRED,
  RESET_INCOMPLETE,
  RESET_INVALID,
  RESET_INVALID_TOKEN,
  RESET_LONG,
  RESET_MISMATCH,
  RESET_NOT_CONFIGURED,
  RESET_PASSWORD,
  RESET_SAVED_BODY,
  RESET_SAVED_TITLE,
  RESET_SHORT,
  RESET_SIGNIN_LINK,
  RESET_SUBMIT,
  RESET_UNAVAILABLE,
  RESET_WEAK,
} from "@/lib/copy";
import { passwordProblem, readRecoveryPayload, type RecoveryPayload } from "@/lib/passwordReset";

/**
 * Choosing a new password from a recovery link.
 *
 * The token arrives in the URL fragment, which no server can see, so this component reads it in the browser
 * and immediately takes it back out of the address bar (`history.replaceState`) - from then on it lives in
 * memory only. The password it collects is sent to this app's own route, never from the browser to the
 * account service, and it is cleared from state the moment the request returns.
 *
 * Every outcome the route can report gets its own line, because they are different facts:
 *
 *   - `saved`           the account service accepted the new password, so the screen points at sign-in;
 *   - `invalid-token`   the link is expired, already used, or not a recovery at all;
 *   - `weak-password`   the account service refused the password itself;
 *   - `unavailable`     the account service could not be reached, and nothing was changed;
 *   - `not-configured`  this deployment has no account service configured;
 *   - the four local ones (`invalid`, `short`, `long`, `mismatch`) are caught here so that the round trip is
 *     not made at all.
 *
 * A link that carries nothing usable is not a failure to report as one: it is simply not a recovery link,
 * and the screen says so and offers the two destinations this app actually serves.
 */
type Outcome =
  | "idle"
  | "busy"
  | "saved"
  | "empty"
  | "invalid"
  | "short"
  | "long"
  | "mismatch"
  | "invalid-token"
  | "weak-password"
  | "unavailable"
  | "not-configured";

/** The one link shape on this screen, so its destinations cannot drift apart. */
const LINK = "inline-flex min-h-11 items-center text-label font-medium text-accent-text underline";

/**
 * Nothing to subscribe to.
 *
 * The fragment is read once per mount and then removed from the address bar, so there is no event that could
 * change it while this screen is open. `useSyncExternalStore` is used for what it is good at here: giving the
 * server render its own snapshot (`null`, meaning "no fragment is readable on a server") without a hydration
 * mismatch, which is the same reason `AnonJournal` uses it for this tab's storage.
 */
const NO_SUBSCRIPTION = () => () => {};

export default function ResetPasswordForm() {
  const read = useRef<RecoveryPayload | null>(null);

  // Read once, then keep: the fragment is stripped from the address bar immediately afterwards, and a
  // snapshot that re-read the URL would find nothing and take the form away mid-typing.
  const snapshot = useCallback(() => {
    read.current ??= readRecoveryPayload(window.location.hash, window.location.search);

    return read.current;
  }, []);

  const payload = useSyncExternalStore(NO_SUBSCRIPTION, snapshot, () => null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("idle");

  useEffect(() => {
    // The token is removed from the address bar as soon as it has been read, so it is not left in history,
    // in a bookmark, or in a screenshot of the screen.
    if (payload !== null) window.history.replaceState(null, "", "/reset-password");
  }, [payload]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (payload === null || payload.kind === "none" || payload.kind === "expired") return;

    const problem = passwordProblem(password, confirmation);

    if (problem !== null) {
      setOutcome(problem);

      return;
    }

    setOutcome("busy");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(payload.kind === "token" ? { token: payload.token } : { tokenHash: payload.tokenHash }),
          password,
        }),
      });

      setPassword("");
      setConfirmation("");

      if (response.ok) {
        setOutcome("saved");

        return;
      }

      if (response.status === 500) {
        setOutcome("not-configured");

        return;
      }

      const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
      const error = typeof body?.error === "string" ? body.error : "";

      setOutcome(
        error === "invalid-token" ? "invalid-token" : error === "weak-password" ? "weak-password" : "unavailable",
      );
    } catch {
      setPassword("");
      setConfirmation("");
      setOutcome("unavailable");
    }
  }

  // The fragment has not been read yet: this is one frame, and a placeholder here would only flash.
  if (payload === null) return null;

  if (payload.kind === "none" || payload.kind === "expired") {
    return (
      <Panel>
        <p className="text-body leading-6 text-ink-muted">
          {payload.kind === "expired" ? RESET_EXPIRED : RESET_INCOMPLETE}
        </p>

        <Link href="/sign-in" className={LINK}>
          {RESET_SIGNIN_LINK}
        </Link>
      </Panel>
    );
  }

  if (outcome === "saved") {
    return (
      <Panel>
        <h2 className="text-lead font-medium text-ink">{RESET_SAVED_TITLE}</h2>
        <p className="text-body leading-6 text-ink-muted">{RESET_SAVED_BODY}</p>

        <Link href="/sign-in" className={LINK}>
          {RESET_SIGNIN_LINK}
        </Link>
      </Panel>
    );
  }

  const problem =
    outcome === "empty" || outcome === "invalid"
      ? RESET_INVALID
      : outcome === "short"
        ? RESET_SHORT
        : outcome === "long"
          ? RESET_LONG
          : outcome === "mismatch"
            ? RESET_MISMATCH
            : outcome === "invalid-token"
              ? RESET_INVALID_TOKEN
              : outcome === "weak-password"
                ? RESET_WEAK
                : outcome === "unavailable"
                  ? RESET_UNAVAILABLE
                  : outcome === "not-configured"
                    ? RESET_NOT_CONFIGURED
                    : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField
        id="reset-password"
        label={RESET_PASSWORD}
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="new-password"
        required
      />

      <TextField
        id="reset-confirm"
        label={RESET_CONFIRM}
        value={confirmation}
        onChange={setConfirmation}
        type="password"
        autoComplete="new-password"
        required
      />

      <Button type="submit" disabled={outcome === "busy"} className="self-start">
        {RESET_SUBMIT}
      </Button>

      {problem === null ? null : (
        <p role="alert" className="text-label text-danger-text">
          {problem}
        </p>
      )}
    </form>
  );
}

