"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import Button from "@/components/Button";
import Panel from "@/components/Panel";
import TextField from "@/components/TextField";
import {
  SIGNUP_CONFIRM_BODY,
  SIGNUP_CONFIRM_LINK,
  SIGNUP_CONFIRM_TITLE,
  SIGNUP_EMAIL,
  SIGNUP_FAILED,
  SIGNUP_INVALID,
  SIGNUP_NOT_CONFIGURED,
  SIGNUP_PASSWORD,
  SIGNUP_SUBMIT,
  SIGNUP_UNAVAILABLE,
} from "@/lib/copy";

/**
 * The create-account form - the sign-in form's twin, for the other half of the same session.
 *
 * Every outcome the server can report gets its own state, because they are different facts:
 *
 *   - `confirmed`   a session came back: the account exists and the person is signed in, so they are sent
 *                   to the check-in - the product's own first action, and the one whose result the new
 *                   account can now keep;
 *   - `confirm`     no session came back, because this project asks new accounts to confirm their email
 *                   address first. The screen says that, and links to sign in. Nothing is claimed about
 *                   an email having been sent, because the server does not say so and this screen will not
 *                   guess;
 *   - `failed`      the account service refused the pair. The screen does not say why: the service does
 *                   not tell it, and a guess would be wrong as often as right;
 *   - `unavailable` the service could not be reached. Nothing was created;
 *   - `invalid`     the fields were empty, caught here so the round trip is not made;
 *   - `not-configured` this deployment has no account service configured.
 *
 * The password lives in component state only for as long as it takes to send it, and is cleared as soon
 * as the request comes back. No token ever reaches this component: the route sets the httpOnly cookie.
 */
type Outcome = "idle" | "busy" | "failed" | "unavailable" | "invalid" | "not-configured" | "confirm";

export default function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (email.trim().length === 0 || password.length === 0) {
      setOutcome("invalid");
      return;
    }

    setOutcome("busy");

    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      setPassword("");

      if (response.ok) {
        const body = (await response.json()) as { confirmed?: unknown };

        if (body.confirmed === true) {
          router.push("/checkin");
          router.refresh();

          return;
        }

        setOutcome("confirm");

        return;
      }

      setOutcome(response.status === 400 ? "failed" : response.status === 500 ? "not-configured" : "unavailable");
    } catch {
      setPassword("");
      setOutcome("unavailable");
    }
  }

  if (outcome === "confirm") {
    return (
      <Panel>
        <h2 className="text-lead font-medium text-ink">{SIGNUP_CONFIRM_TITLE}</h2>
        <p className="text-body leading-6 text-ink-muted">{SIGNUP_CONFIRM_BODY}</p>

        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center self-start text-label font-medium text-accent-text underline"
        >
          {SIGNUP_CONFIRM_LINK}
        </Link>
      </Panel>
    );
  }

  const busy = outcome === "busy";

  const problem =
    outcome === "invalid"
      ? SIGNUP_INVALID
      : outcome === "failed"
        ? SIGNUP_FAILED
        : outcome === "unavailable"
          ? SIGNUP_UNAVAILABLE
          : outcome === "not-configured"
            ? SIGNUP_NOT_CONFIGURED
            : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField
        id="signup-email"
        label={SIGNUP_EMAIL}
        value={email}
        onChange={setEmail}
        type="email"
        autoComplete="email"
        required
      />

      <TextField
        id="signup-password"
        label={SIGNUP_PASSWORD}
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="new-password"
        required
      />

      <Button type="submit" disabled={busy} className="self-start">
        {SIGNUP_SUBMIT}
      </Button>

      {problem === null ? null : (
        <p role="alert" className="text-label text-danger-text">
          {problem}
        </p>
      )}
    </form>
  );
}
