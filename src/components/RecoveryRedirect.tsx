"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { readRecoveryPayload } from "@/lib/passwordReset";

/**
 * Sends a recovery link to the screen that can use it.
 *
 * Why this exists: the account service redirects a recovery link to the site's configured address, which is
 * the site root, and puts the session in the URL fragment. The fragment is never sent to a server, so no
 * route can see it; this component is the one thing that looks, and it only ever looks for a recovery
 * payload. It forwards the fragment unchanged - the screen that reads it strips it from the address bar -
 * and it does nothing at all on an ordinary page view, so every other visitor pays one string comparison.
 *
 * It is mounted once, in the root layout, because the landing page for a recovery link is whatever the
 * project's configured address happens to be, and that is a setting this build must not require anyone to
 * change. Nothing here logs, stores or sends a token: the only thing it does with one is put it back in the
 * address bar of the screen built to receive it.
 */
export default function RecoveryRedirect() {
  const router = useRouter();

  useEffect(() => {
    const { hash, search, pathname } = window.location;

    if (pathname === "/reset-password") return;
    if (readRecoveryPayload(hash, search).kind === "none") return;

    router.replace(`/reset-password${search}${hash}`);
  }, [router]);

  return null;
}
