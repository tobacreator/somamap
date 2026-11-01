import type { JournalEntry } from "./patterns.ts";

/**
 * Amara's demo check-ins - blueprint Chapter 9.1, Table 15, transcribed verbatim.
 *
 * Twelve check-ins across eight days (Mon 26 Oct 2026 to Mon 2 Nov 2026), in the four
 * columns Table 15 gives: date, region, the words she chose, and her own sentence. The
 * blueprint's seed script (G8.1, `npm run seed`) will load this list into a fresh demo
 * account; T7 runs the journal engine over it.
 *
 * Nothing here was invented, reordered or renamed. Table 15 lists two check-ins for
 * Mon Oct 26, Wed Oct 28, Fri Oct 30 and Sun Nov 1, and one each for the other days.
 */
export const SEED_ENTRIES: readonly JournalEntry[] = [
  { date: "2026-10-26", region: "shoulders", qualityWords: ["tight", "heavy"], ownSentence: "Like a scarf knotted too tight" },
  { date: "2026-10-26", region: "chest", qualityWords: ["flutter"], ownSentence: "A moth in a lantern" },
  { date: "2026-10-27", region: "shoulders", qualityWords: ["tight"], ownSentence: "The same scarf, one notch looser" },
  { date: "2026-10-28", region: "jaw", qualityWords: ["clenched"], ownSentence: "A vice slowly easing" },
  { date: "2026-10-28", region: "belly", qualityWords: ["butterflies"], ownSentence: "Popcorn popping" },
  { date: "2026-10-29", region: "shoulders", qualityWords: ["tight", "warm"], ownSentence: "The knot again, softer today" },
  { date: "2026-10-30", region: "head", qualityWords: ["press"], ownSentence: "A too-tight headband" },
  { date: "2026-10-30", region: "belly", qualityWords: ["flutter"], ownSentence: "Popcorn again" },
  { date: "2026-10-31", region: "shoulders", qualityWords: ["loose"], ownSentence: "The scarf is off" },
  { date: "2026-11-01", region: "chest", qualityWords: ["open"], ownSentence: "A window let in" },
  { date: "2026-11-01", region: "hands", qualityWords: ["tingling"], ownSentence: "Fizzy drink in the fingertips" },
  { date: "2026-11-02", region: "shoulders", qualityWords: ["tight"], ownSentence: "The Monday scarf is back" },
];
