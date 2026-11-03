/**
 * Where a completed sign-in goes - the `next` parameter, validated by exact match (`ISS-17`).
 *
 * Two problems this closes. A signed-in person was always sent to Settings, whatever they had asked
 * for, so the journal link on the landing page ended on a screen they did not choose. And a protected
 * route sent them to sign-in with no way back, so the page they wanted was lost at the door.
 *
 * The rule is an **exact-match allow-list of this app's own paths**, not a pattern: anything else -
 * an absolute URL, a protocol-relative `//host`, a `javascript:` value, an encoded or
 * case-different spelling, a path with a query or a fragment, a traversal, an array (which is what
 * Next hands over when the parameter is repeated) - is not in the set and therefore cannot be the
 * destination. Nothing is normalised, decoded or rewritten on the way through, because a value that
 * needs interpreting is a value this function cannot vouch for. The default is the journal, which is
 * the screen the authenticated journey is about.
 *
 * Pure, so the whole rule is unit-tested with injected values, and no caller has to re-derive it.
 */

/** The paths a sign-in may land on. Every one of them is a route this app serves. */
const ALLOWED_DESTINATIONS = ["/", "/journal", "/checkin", "/settings"] as const;

/** Where a sign-in goes when nothing valid was asked for. */
export const DEFAULT_SIGN_IN_DESTINATION = "/journal";

/** The destination for a `next` value: an allow-listed path, or the journal. */
export function signInDestination(raw: string | readonly string[] | undefined | null): string {
  // A repeated parameter arrives as an array; only a single, exact value is ever accepted.
  const value = typeof raw === "string" ? raw : undefined;

  return value !== undefined && (ALLOWED_DESTINATIONS as readonly string[]).includes(value)
    ? value
    : DEFAULT_SIGN_IN_DESTINATION;
}
