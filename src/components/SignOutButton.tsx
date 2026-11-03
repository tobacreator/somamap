"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import Button from "@/components/Button";
import { SETTINGS_SIGN_OUT, SETTINGS_SIGN_OUT_BUSY, SETTINGS_SIGN_OUT_FAILED } from "@/lib/copy";

/**
 * Sign out - the control Settings was missing (`ISS-17`).
 *
 * It posts to the sign-out route, which deletes the one cookie this app sets, and only then sends the
 * browser to the sign-in screen. Nothing is claimed before the server has answered: a refusal or a
 * failed request leaves the session exactly as it was, says so, and stays on this screen, because a
 * sign-out that did not happen must not look like one that did.
 *
 * The request carries no body and no identity - there is nothing to send. The refresh afterwards makes
 * the server re-read the session, which is now absent.
 */
export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setBusy(true);
    setFailed(false);

    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST" });

      if (!response.ok) {
        setFailed(true);

        return;
      }
    } catch {
      setFailed(true);

      return;
    } finally {
      setBusy(false);
    }

    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={() => void signOut()} disabled={busy} className="self-start">
        {busy ? SETTINGS_SIGN_OUT_BUSY : SETTINGS_SIGN_OUT}
      </Button>

      {failed ? (
        <p role="alert" className="text-label text-danger-text">
          {SETTINGS_SIGN_OUT_FAILED}
        </p>
      ) : null}
    </div>
  );
}
