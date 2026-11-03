import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import CheckInFlow from "@/components/CheckInFlow";
import Screen from "@/components/Screen";
import { CHECKIN_LOADING } from "@/lib/copy";
import { modelMode } from "@/lib/models";

/**
 * The check-in start screen - blueprint Section 4.4 and repo layout (`/checkin`).
 *
 * Built at phone width first (blueprint Section 1.4). The flow itself is a client component so that
 * iron rule 4's stop can replace the whole screen; this file stays a server component so the page can
 * carry its metadata and so the processing mode can be read where it is authoritative.
 *
 * **The mode is read per request and handed to the flow as a plain value** (Phase 2D copy follow-up).
 * `connection()` is what makes it a request-time read under this Next version's cache components, and -
 * like the session read on the settings screen - it has to sit behind a `Suspense` boundary, or the
 * route cannot be prerendered at all. Without it the mode would be baked in at build time, and a server
 * started with `MODEL_MODE=live` would still show the mock disclosure: wrong in exactly the case that
 * matters. Nothing is actually waited on - there is no data to fetch, only the environment of the
 * process that is answering - so the shell prerenders, the flow follows immediately, and the disclosure
 * can never disagree with what the running build does.
 *
 * The `Screen` shell supplies the column, the gutter and the fixed line, so this route no longer
 * carries its own copy of any of them (Phase B).
 *
 * Not built here, and not claimed: the photo path, the segment mask, and writing the session row.
 */
export const metadata: Metadata = {
  title: "SomaMap - check in",
  description: "Find the words for what you feel.",
};

/** The request-time part: it reads the mode, so it streams in behind the boundary below. */
async function CheckInBody() {
  await connection();

  return <CheckInFlow mode={modelMode()} />;
}

export default function CheckInPage() {
  return (
    <Screen>
      <Suspense fallback={<p className="text-label text-ink-muted">{CHECKIN_LOADING}</p>}>
        <CheckInBody />
      </Suspense>
    </Screen>
  );
}

