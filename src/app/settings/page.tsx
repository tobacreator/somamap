import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import DeleteEverything from "@/components/DeleteEverything";
import Screen from "@/components/Screen";
import { currentSession, supabaseTarget } from "@/lib/authSession";
import { SETTINGS_INTRO, SETTINGS_LOADING, SETTINGS_TITLE } from "@/lib/copy";
import { targetHost } from "@/lib/supabaseTarget";

/**
 * Settings - blueprint Chapter 6.1, the screen that carries Delete everything.
 *
 * The session read sits behind a Suspense boundary, which is what this Next version
 * requires of anything that reads cookies with cache components on: the rest of the page
 * prerenders into a static shell and only the signed-in part waits for the request.
 *
 * The target shown to the user is resolved here, on the server, from the same validated
 * configuration the deletion route uses - so the environment on screen is the environment
 * that will be acted on. Only the mode and the hostname cross to the browser: never a key,
 * a token or a cookie.
 */
export const metadata: Metadata = {
  title: "SomaMap - settings",
};

/** The signed-in part: it reads the session, so it streams in behind the boundary. */
async function SettingsBody() {
  const resolution = supabaseTarget();

  // An unusable configuration is shown, not hidden behind a redirect: the screen says so and
  // the switch is disabled, so nothing can be pressed against a target nobody confirmed.
  // Only the failure category crosses to the browser - never a URL, a key or a token.
  if (!resolution.ok) {
    return <DeleteEverything target={null} reason={resolution.reason} />;
  }

  const session = await currentSession();

  if (!session) redirect("/sign-in");

  const target = { mode: resolution.target.mode, host: targetHost(resolution.target) };

  return <DeleteEverything target={target} reason={null} />;
}

export default function SettingsPage() {
  return (
    <Screen>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{SETTINGS_TITLE}</h1>
        <p className="text-body text-ink-muted">{SETTINGS_INTRO}</p>
      </header>

      <Suspense fallback={<p className="text-label text-ink-muted">{SETTINGS_LOADING}</p>}>
        <SettingsBody />
      </Suspense>
    </Screen>
  );
}

