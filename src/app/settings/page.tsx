import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import DeleteEverything from "@/components/DeleteEverything";
import ProcessingStatus from "@/components/ProcessingStatus";
import Screen from "@/components/Screen";
import SignOutButton from "@/components/SignOutButton";
import { currentSession, supabaseTarget } from "@/lib/authSession";
import {
  SETTINGS_INTRO,
  SETTINGS_LOADING,
  SETTINGS_NAV_CHECKIN,
  SETTINGS_NAV_HOME,
  SETTINGS_NAV_JOURNAL,
  SETTINGS_NAV_LABEL,
  SETTINGS_TITLE,
} from "@/lib/copy";
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

/** The one link shape on this screen, so the three ways on cannot drift apart. */
const NAV_LINK = "inline-flex min-h-11 items-center text-label font-medium text-accent-text underline";

/**
 * The signed-in part: it reads the session, so it streams in behind the boundary.
 *
 * **The session is checked first, and the configuration second** (`ISS-17`). The order used to be the
 * other way round, and the consequence was visible: on a deployment whose Supabase target could not be
 * resolved, an unauthenticated visitor was shown the configuration-refusal panel - with the refusal
 * reason in it - instead of being sent to sign in. Nothing about this deployment's environment is read,
 * resolved or displayed until a verified session exists, so an unauthenticated request learns nothing.
 *
 * With a session, both remaining outcomes are honest: a resolvable target renders the delete switch for
 * that target, and an unresolvable one renders the "switched off" panel with its reason category. The
 * sign-out control is rendered either way - being unable to resolve the environment is not a reason to
 * trap someone in a session they want to end.
 */
async function SettingsBody() {
  const session = await currentSession();

  if (!session) redirect("/sign-in?next=%2Fsettings");

  const resolution = supabaseTarget();
  const target = resolution.ok ? { mode: resolution.target.mode, host: targetHost(resolution.target) } : null;

  return (
    <>
      <DeleteEverything target={target} reason={resolution.ok ? null : resolution.reason} />
      <ProcessingStatus />
      <SignOutButton />
    </>
  );
}

export default function SettingsPage() {
  return (
    <Screen>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{SETTINGS_TITLE}</h1>
        <p className="text-body text-ink-muted">{SETTINGS_INTRO}</p>

        {/* The three ways on (`ISS-17`). Settings was a dead end: the delete switch and nothing else,
            so the journal was reachable only by editing the address bar. The labels are the journal's
            own strings where the destination is the journal's own screen. */}
        <nav aria-label={SETTINGS_NAV_LABEL} className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/journal" className={NAV_LINK}>
            {SETTINGS_NAV_JOURNAL}
          </Link>

          <Link href="/checkin" className={NAV_LINK}>
            {SETTINGS_NAV_CHECKIN}
          </Link>

          <Link href="/" className={NAV_LINK}>
            {SETTINGS_NAV_HOME}
          </Link>
        </nav>
      </header>

      <Suspense fallback={<p className="text-label text-ink-muted">{SETTINGS_LOADING}</p>}>
        <SettingsBody />
      </Suspense>
    </Screen>
  );
}

