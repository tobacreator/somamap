"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import Button from "@/components/Button";
import TextField from "@/components/TextField";
import { SIGNIN_EMAIL, SIGNIN_FAILED, SIGNIN_PASSWORD, SIGNIN_SUBMIT } from "@/lib/copy";
import { DEFAULT_SIGN_IN_DESTINATION, signInDestination } from "@/lib/signInDestination";

/**
 * The sign-in form - the minimum session the delete-everything action needs.
 *
 * The password lives in component state for as long as it takes to send it, and is cleared the
 * moment the request comes back. Nothing is logged, and the token that comes back is set as an
 * httpOnly cookie by the route, so it never reaches this component.
 *
 * Phase B moved the fields onto the shared `TextField`, which is what retired the drift between
 * this form's `rounded-lg p-2` inputs and the answer fields' `rounded-xl p-3`.
 *
 * `ISS-17`: where the person goes next is now the destination the route asked for, defaulting to the
 * journal - it used to be Settings whatever the person had clicked. The value arrives already validated
 * by the page, and is validated again here: this component is the last place before a navigation, and a
 * second exact-match check costs nothing and cannot be the thing that lets an unexpected value through.
 */
export default function SignInForm({ next = DEFAULT_SIGN_IN_DESTINATION }: { next?: string }) {
  const router = useRouter();
  const destination = signInDestination(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      setPassword("");

      if (response.ok) {
        router.push(destination);
        router.refresh();

        return;
      }

      setFailed(true);
    } catch {
      setPassword("");
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField
        id="signin-email"
        label={SIGNIN_EMAIL}
        value={email}
        onChange={setEmail}
        type="email"
        autoComplete="email"
        required
      />

      <TextField
        id="signin-password"
        label={SIGNIN_PASSWORD}
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="current-password"
        required
      />

      <Button type="submit" disabled={busy} className="self-start">
        {SIGNIN_SUBMIT}
      </Button>

      {failed ? (
        <p role="alert" className="text-label text-danger-text">
          {SIGNIN_FAILED}
        </p>
      ) : null}
    </form>
  );
}

