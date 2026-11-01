import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAUSAL_PHRASES,
  CONDITION_NAME_SAMPLE,
  buildRoundupDraft,
  findProhibitedLanguage,
  foreignWords,
  weeklyDrafts,
  type JournalEntry,
} from "../../src/lib/patterns.ts";
import { SEED_ENTRIES } from "../../src/lib/seedData.ts";
import type { RedTeamOutcome } from "./types.ts";

/**
 * T7 - correlation audit (blueprint Table 7, Chapter 7.1 and G6.2).
 *
 * Required: run the journal engine on the seed dataset and scan the roundup output for
 * causal language ('may mean', 'linked to', 'suggests', any condition name) -> zero hits;
 * output only counts and clusters of the user's own vocabulary.
 *
 * No model, no network and no database: the engine is deterministic, so this row is a pure
 * function of the code and Table 15. Two scans run over the output, plus two structural
 * checks:
 *
 *   1. the blueprint's causal phrases and a sample of condition names must be absent;
 *   2. every word in the output must come from the closed template list or from the user;
 *   3. every draft must carry the draft status, and the engine must have no way to say
 *      "saved";
 *   4. the filter must actually bite - every banned phrase and every sampled condition
 *      name has to be caught when it is put in front of it.
 *
 * WHAT THE BLUEPRINT LEAVES OPEN, stated rather than papered over: Table 7 and G6.2 say
 * "any condition name", but the blueprint never enumerates one. The sample in patterns.ts
 * is the only concrete part of that clause; the closed-vocabulary check in (2) is the real
 * guarantee, because a word the engine did not receive from the user cannot reach the
 * output. Both facts are reported in the evidence line and in BUILD-REPORT.md Entry 21.
 */

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PATTERNS_FILE = join(PROJECT_ROOT, "src", "lib", "patterns.ts");

/** Sentences that must be refused if the engine ever tried to emit them itself. */
const HOSTILE_ENGINE_LINES: readonly string[] = [
  "Your shoulders may mean a long week.",
  "That tightness is linked to your desk.",
  "The pattern suggests something about your sleep.",
  "It is because of your posture.",
  "Sitting causes the tightness.",
  ...CONDITION_NAME_SAMPLE.map((name) => `Your week: ${name}.`),
];

/** The seed entries of one ISO week, for the per-week scans. */
function entriesOf(weekStart: string): readonly JournalEntry[] {
  const next = new Date(`${weekStart}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  const nextWeek = next.toISOString().slice(0, 10);

  return SEED_ENTRIES.filter((entry) => entry.date >= weekStart && entry.date < nextWeek);
}

export function t7CorrelationAudit(): RedTeamOutcome {
  if (SEED_ENTRIES.length !== 12) {
    return { status: "FAIL", detail: `the seed dataset has ${SEED_ENTRIES.length} check-ins; Table 15 lists 12` };
  }

  // The engine, run over the prescribed seed dataset: the whole eight days, and each ISO
  // week the seed touches (the blueprint's seed spans two Mondays).
  const weeks = weeklyDrafts(SEED_ENTRIES);
  const runs = [
    { draft: buildRoundupDraft(SEED_ENTRIES), entries: SEED_ENTRIES },
    ...weeks.map((draft) => ({ draft, entries: entriesOf(draft.weekStart) })),
  ];
  const texts = runs.map((run) => run.draft.text);

  // 1. Zero prohibited language in every draft the engine produced.
  const hits = texts.flatMap((text) => findProhibitedLanguage(text));

  if (hits.length > 0) {
    return {
      status: "FAIL",
      detail: `the roundup output carried prohibited language: ${[...new Set(hits)].join(", ")}`,
    };
  }

  // 2. Output only counts and clusters of the user's own vocabulary.
  const foreign = runs.flatMap((run) => foreignWords(run.draft.text, run.entries));

  if (foreign.length > 0) {
    return {
      status: "FAIL",
      detail: `the roundup output carried words from neither the template nor the user: ${[...new Set(foreign)].join(", ")}`,
    };
  }

  // 3. A roundup is a draft, and the engine has no way to say otherwise.
  const notDraft = runs.filter((run) => run.draft.status !== "draft");

  if (notDraft.length > 0) {
    return { status: "FAIL", detail: `${notDraft.length} roundup(s) were not drafts` };
  }

  if (readFileSync(PATTERNS_FILE, "utf8").includes('"saved"')) {
    return { status: "FAIL", detail: "the journal engine can produce the saved status, which it must never do" };
  }

  // 4. The guard has to bite: every banned phrase and every sampled condition name is caught.
  const missed = HOSTILE_ENGINE_LINES.filter((line) => findProhibitedLanguage(line).length === 0);

  if (missed.length > 0) {
    return {
      status: "FAIL",
      detail: `${missed.length} hostile engine line(s) passed the filter, for example: ${missed[0]}`,
    };
  }

  const uncovered = CAUSAL_PHRASES.filter((phrase) => findProhibitedLanguage(`A line with ${phrase} in it.`).length === 0);

  if (uncovered.length > 0) {
    return { status: "FAIL", detail: `the filter does not catch: ${uncovered.join(", ")}` };
  }

  // Evidence that the output is counts and clusters of the user's words, not a reading.
  const wholeSeed = runs[0].draft;
  const tight = wholeSeed.words.find((word) => word.word === "tight");
  const shoulders = wholeSeed.regions.find((region) => region.region === "shoulders");

  if (!tight || tight.count !== 4 || !shoulders || shoulders.count !== 5) {
    return {
      status: "FAIL",
      detail: `the counts do not match the seed: tight=${tight?.count ?? "missing"}, shoulders=${shoulders?.count ?? "missing"}`,
    };
  }

  const quoted = SEED_ENTRIES.filter((entry) => wholeSeed.text.includes(`"${entry.ownSentence}"`));

  if (quoted.length !== SEED_ENTRIES.length) {
    return {
      status: "FAIL",
      detail: `${quoted.length} of ${SEED_ENTRIES.length} of the user's own sentences appear verbatim in the draft`,
    };
  }

  return {
    status: "PASS",
    detail: `engine run over Table 15's 12 check-ins: ${runs.length} draft(s) (the whole seed plus ${weeks.length} ISO weeks), zero hits for the blueprint's causal phrases (${CAUSAL_PHRASES.join(", ")}) and zero hits for the ${CONDITION_NAME_SAMPLE.length}-name condition sample; zero words outside the closed template plus the user's own vocabulary; every draft carries status=draft and the engine cannot produce saved; all ${HOSTILE_ENGINE_LINES.length} hostile engine lines were caught by the filter; counts checked against the seed (tight 4 times, shoulders 5 check-ins) and all 12 of the user's own sentences appear verbatim. Note: the blueprint never enumerates condition names, so "any condition name" is covered by the sample plus the closed-vocabulary check rather than exhaustively - see BUILD-REPORT.md Entry 21`,
  };
}

