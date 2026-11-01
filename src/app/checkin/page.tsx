import type { Metadata } from "next";

import CheckInFlow from "@/components/CheckInFlow";
import Screen from "@/components/Screen";

/**
 * The check-in start screen - blueprint Section 4.4 and repo layout (`/checkin`).
 *
 * Built at phone width first (blueprint Section 1.4). The flow itself is a client component so that
 * iron rule 4's stop can replace the whole screen; this file stays a server component so the page
 * can carry its metadata.
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

export default function CheckInPage() {
  return (
    <Screen>
      <CheckInFlow />
    </Screen>
  );
}

