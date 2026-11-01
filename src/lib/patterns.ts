import { normaliseForMatch } from "./crisis.ts";

/**
 * The journal engine - blueprint Chapter 7.1, Table 5 and Table 7's T7 row.
 *
 * The engine counts and clusters the user's own vocabulary and nothing else. It has no
 * model, no network and no clock: the same entries always produce the same draft. Its
 * output is counts (how often a word came up, on which days), clusters (check-ins that
 * share a word) and the user's own sentences verbatim - never a statement about what any
 * of it means.
 *
 * Two guards hold that line:
 *
 *   1. `findProhibitedLanguage` scans text for the blueprint's causal phrases and for a
 *      sample of condition names, and `buildRoundupDraft` throws rather than return a
 *      draft that trips it - Chapter 7.1's filter "throws if any appear".
 *   2. The draft is assembled from a closed template plus the user's own words, so no
 *      vocabulary of the engine's own can reach the page. `foreignWords` proves it: a
 *      test asserts every word in the output came from the template list or the user.
 *
 * A roundup is always a DRAFT: `status` is the literal "draft", there is no save path in
 * this module, and nothing here writes to a database.
 *
 * The blueprint's live design embeds the sentences with the Fireworks embeddings endpoint
 * to cluster them. There is no provider in this build, so clustering is the deterministic
 * form Chapter 7.1 also names - check-ins that share vocabulary - and the embedding path
 * is not implemented rather than faked.
 */

/** One check-in, in the four columns Table 15 gives the seed: date, region, words, sentence. */
export type JournalEntry = {
  /** The check-in date, ISO `YYYY-MM-DD`. */
  date: string;
  /** The region the user named, from the fixed geometric map. */
  region: string;
  /** The words the user chose - their vocabulary. */
  qualityWords: readonly string[];
  /** The user's own sentence, verbatim. */
  ownSentence: string;
};

/** One word the user chose, how often it came up, and which weekdays carried it. */
export type WordCount = { word: string; count: number; days: readonly string[] };

/** One weekday and how many check-ins fell on it. */
export type DayCount = { day: string; count: number };

/** One region and how many check-ins named it. */
export type RegionCount = { region: string; count: number };

/** A group of check-ins that share one word the user chose. */
export type VocabularyCluster = { word: string; dates: readonly string[] };

/**
 * The causal phrases Chapter 7.1 lists, verbatim. They are matched on normalised text, so
 * case and punctuation cannot hide one.
 */
export const CAUSAL_PHRASES: readonly string[] = [
  "may mean",
  "linked to",
  "suggests",
  "because of",
  "causes",
];

/**
 * A SAMPLE of condition names, not an approved list.
 *
 * Table 7's T7 row says the roundup is scanned for "any condition name", and G6.2 repeats
 * it, but the blueprint never enumerates one. This sample is here so the scan has
 * something concrete to catch, and the real guarantee is structural: the draft can only
 * contain template words and the user's own words, so no condition name can enter it from
 * the engine at all. The gap is recorded in BUILD-REPORT.md Entry 21.
 */
export const CONDITION_NAME_SAMPLE: readonly string[] = [
  "fibromyalgia",
  "migraine",
  "arthritis",
  "asthma",
  "diabetes",
  "endometriosis",
  "lupus",
  "anxiety",
  "depression",
  "ibs",
  "gerd",
  "neuropathy",
];

/**
 * Every phrase in `text` that the engine must never emit: the blueprint's causal phrases
 * and the condition-name sample. Empty means the text is observational only.
 */
export function findProhibitedLanguage(text: string): string[] {
  const haystack = normaliseForMatch(text);
  const phrases: readonly string[] = [...CAUSAL_PHRASES, ...CONDITION_NAME_SAMPLE];

  return phrases.filter((phrase) => {
    const needle = normaliseForMatch(phrase);

    return needle.length > 0 && haystack.includes(needle);
  });
}

/** Throw rather than let text with prohibited language leave the engine. */
export function assertObservational(text: string): void {
  const prohibited = findProhibitedLanguage(text);

  if (prohibited.length > 0) {
    throw new Error(`the roundup draft carried prohibited language: ${prohibited.join(", ")}`);
  }
}

/** Weekday names by index, for `weekdayOf`. */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Weekdays in the order a draft reads best, Monday first. */
const WEEK_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** The weekday name of an ISO date, from the date alone: no locale, no clock. */
export function weekdayOf(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);

  return Number.isNaN(parsed.getTime()) ? "" : (WEEKDAYS[parsed.getUTCDay()] ?? "");
}

/** The Monday of the week an ISO date falls in, as `YYYY-MM-DD`. */
export function weekStartOf(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) return "";

  parsed.setUTCDate(parsed.getUTCDate() - ((parsed.getUTCDay() + 6) % 7));

  return parsed.toISOString().slice(0, 10);
}

/**
 * How often each word the user chose came up, and on which weekdays. Only the words the
 * user chose are counted: the words are theirs, so a count is an observation about their
 * vocabulary rather than a reading of it.
 */
export function chosenWordCounts(entries: readonly JournalEntry[]): WordCount[] {
  const counts = new Map<string, { count: number; days: string[] }>();

  for (const entry of entries) {
    const day = weekdayOf(entry.date);

    for (const raw of entry.qualityWords) {
      const word = normaliseForMatch(raw);

      if (word.length === 0) continue;

      const found = counts.get(word) ?? { count: 0, days: [] };
      found.count += 1;

      if (day.length > 0 && !found.days.includes(day)) found.days.push(day);

      counts.set(word, found);
    }
  }

  return [...counts.entries()]
    .map(([word, value]) => ({ word, count: value.count, days: value.days }))
    .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : 1));
}

/** How many check-ins fell on each weekday, Monday first. */
export function dayCounts(entries: readonly JournalEntry[]): DayCount[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const day = weekdayOf(entry.date);

    if (day.length > 0) counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return WEEK_ORDER.filter((day) => counts.has(day)).map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

/** How many check-ins named each region, the most named first. */
export function regionCounts(entries: readonly JournalEntry[]): RegionCount[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const region = entry.region.trim();

    if (region.length > 0) counts.set(region, (counts.get(region) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count || (a.region < b.region ? -1 : 1));
}

/** Check-ins that share a word the user chose: a cluster needs more than one. */
export function vocabularyClusters(entries: readonly JournalEntry[]): VocabularyCluster[] {
  const byWord = new Map<string, string[]>();

  for (const entry of entries) {
    for (const raw of entry.qualityWords) {
      const word = normaliseForMatch(raw);

      if (word.length === 0) continue;

      byWord.set(word, [...(byWord.get(word) ?? []), entry.date]);
    }
  }

  return [...byWord.entries()]
    .filter(([, dates]) => dates.length > 1)
    .map(([word, dates]) => ({ word, dates: [...dates].sort() }))
    .sort((a, b) => b.dates.length - a.dates.length || (a.word < b.word ? -1 : 1));
}

/**
 * Every word the template itself can put into a draft. The engine's own vocabulary is
 * this closed list and nothing else; a test proves no other word can reach the output.
 */
export const ROUNDUP_TEMPLATE_WORDS: readonly string[] = [
  "your",
  "words",
  "this",
  "week",
  "check",
  "ins",
  "in",
  "period",
  "dates",
  "to",
  "you",
  "chose",
  "none",
  "no",
  "were",
  "chosen",
  "time",
  "times",
  "on",
  "days",
  "regions",
  "that",
  "came",
  "up",
  "more",
  "than",
  "once",
  "own",
  "and",
  ...WEEKDAYS,
];

/** A weekly roundup: always a draft, plus everything it was built from. */
export type RoundupDraft = {
  status: "draft";
  /** The Monday of the period, or an empty string when there is nothing to date. */
  weekStart: string;
  text: string;
  words: readonly WordCount[];
  days: readonly DayCount[];
  regions: readonly RegionCount[];
  clusters: readonly VocabularyCluster[];
};

function renderEngineLines(
  entries: readonly JournalEntry[],
  words: readonly WordCount[],
  days: readonly DayCount[],
  regions: readonly RegionCount[],
  clusters: readonly VocabularyCluster[],
): string {
  const lines: string[] = ["Your words this week"];

  if (entries.length === 0) {
    lines.push("No check-ins in this period.");

    return lines.join("\n");
  }

  lines.push(`Check-ins in this period: ${entries.length}.`);
  lines.push(`Dates: ${entries[0].date} to ${entries[entries.length - 1].date}.`);
  lines.push("Words you chose:");

  if (words.length === 0) lines.push("- none were chosen");

  for (const item of words) {
    lines.push(`- ${item.word}: ${item.count} ${item.count === 1 ? "time" : "times"}, on ${item.days.join(", ")}`);
  }

  lines.push(`Days: ${days.map((item) => `${item.day} ${item.count}`).join(", ")}.`);
  lines.push(`Regions: ${regions.map((item) => `${item.region} ${item.count}`).join(", ")}.`);
  lines.push("Words that came up more than once:");

  if (clusters.length === 0) lines.push("- none came up more than once");

  for (const cluster of clusters) {
    lines.push(`- ${cluster.word}: ${cluster.dates.length} check-ins, on ${cluster.dates.join(", ")}`);
  }

  return lines.join("\n");
}

/** The user's own sentences, quoted verbatim - the one part of a draft the user wrote. */
function renderQuotes(entries: readonly JournalEntry[]): string {
  const lines: string[] = ["Your own words:"];

  for (const entry of entries) {
    lines.push(`- "${entry.ownSentence}" (${entry.date})`);
  }

  return lines.join("\n");
}


/**
 * The roundup draft for the entries given - always a draft, never saved, never rendered
 * until the user edits it. It throws rather than return text that trips the filter, which
 * is what Chapter 7.1 asks the filter to do.
 */
export function buildRoundupDraft(entries: readonly JournalEntry[], weekStart?: string): RoundupDraft {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const words = chosenWordCounts(sorted);
  const days = dayCounts(sorted);
  const regions = regionCounts(sorted);
  const clusters = vocabularyClusters(sorted);
  const engineText = renderEngineLines(sorted, words, days, regions, clusters);

  assertObservational(engineText);

  return {
    status: "draft",
    weekStart: weekStart ?? (sorted.length > 0 ? weekStartOf(sorted[0].date) : ""),
    text: `${engineText}\n${renderQuotes(sorted)}`,
    words,
    days,
    regions,
    clusters,
  };
}

/** One draft per ISO week in the entries, oldest week first. */
export function weeklyDrafts(entries: readonly JournalEntry[]): RoundupDraft[] {
  const weeks = new Map<string, JournalEntry[]>();

  for (const entry of entries) {
    const week = weekStartOf(entry.date);

    weeks.set(week, [...(weeks.get(week) ?? []), entry]);
  }

  return [...weeks.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([week, group]) => buildRoundupDraft(group, week));
}

/**
 * Words in `text` that came from neither the template nor the user, which must always be
 * empty. Digit runs are allowed: a date is a date, not vocabulary.
 */
export function foreignWords(text: string, entries: readonly JournalEntry[]): string[] {
  const allowed = new Set<string>(ROUNDUP_TEMPLATE_WORDS.map((word) => normaliseForMatch(word)));

  for (const entry of entries) {
    for (const word of entry.qualityWords) allowed.add(normaliseForMatch(word));
    for (const token of normaliseForMatch(entry.ownSentence).split(" ")) allowed.add(token);
    for (const token of normaliseForMatch(entry.region).split(" ")) allowed.add(token);
  }

  const tokens = normaliseForMatch(text)
    .split(" ")
    .filter((token) => token.length > 0 && !/^\d+$/.test(token));

  return [...new Set(tokens.filter((token) => !allowed.has(token)))].sort();
}
