"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import Button from "@/components/Button";
import TextField from "@/components/TextField";
import { SIGNIN_EMAIL, SIGNIN_FAILED, SIGNIN_PASSWORD, SIGNIN_SUBMIT } from "@/lib/copy";

/**
 * The sign-in form - the minimum session the delete-everything action needs.
 *
 * The password lives in component state for as long as it takes to send it, and is cleared the
 * moment the request comes back. Nothing is logged, and the token that comes back is set as an
 * httpOnly cookie by the route, so it never reaches this component.
 *
 * Phase B moved the fields onto the shared `TextField`, which is what retired the drift between
 * this form's `rounded-lg p-2` inputs and the answer fields' `rounded-xl p-3`.
 */
export default function SignInForm() {
  const router = useRouter();
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
        router.push("/settings");
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

