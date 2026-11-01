import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CAUSAL_PHRASES,
  CONDITION_NAME_SAMPLE,
  assertObservational,
  buildRoundupDraft,
  chosenWordCounts,
  dayCounts,
  findProhibitedLanguage,
  foreignWords,
  regionCounts,
  vocabularyClusters,
  weekdayOf,
  weekStartOf,
  weeklyDrafts,
  type JournalEntry,
} from "./patterns.ts";
import { SEED_ENTRIES } from "./seedData.ts";

/**
 * The journal engine's tests - blueprint Chapter 7.1, Table 5 and T7.
 *
 * Everything here is deterministic: counts, days, clusters and the filter, over Table 15's
 * seed and over small fixtures built in the test.
 */

/** One check-in, for the small fixtures. */
function entry(date: string, region: string, qualityWords: string[], ownSentence: string): JournalEntry {
  return { date, region, qualityWords, ownSentence };
}

describe("journal vocabulary", () => {
  it("counts the words the user chose, and the days that carried them", () => {
    const counts = chosenWordCounts(SEED_ENTRIES);

    assert.deepEqual(counts[0], { word: "tight", count: 4, days: ["Monday", "Tuesday", "Thursday"] });
    assert.deepEqual(counts[1], { word: "flutter", count: 2, days: ["Monday", "Friday"] });
    assert.equal(counts.length, 10);
  });

  it("counts check-ins per weekday, Monday first", () => {
    assert.deepEqual(dayCounts(SEED_ENTRIES), [
      { day: "Monday", count: 3 },
      { day: "Tuesday", count: 1 },
      { day: "Wednesday", count: 2 },
      { day: "Thursday", count: 1 },
      { day: "Friday", count: 2 },
      { day: "Saturday", count: 1 },
      { day: "Sunday", count: 2 },
    ]);
  });

  it("counts the regions the user named", () => {
    const regions = regionCounts(SEED_ENTRIES);

    assert.deepEqual(regions[0], { region: "shoulders", count: 5 });
    assert.equal(regions.length, 6);
  });

  it("clusters only words that came up more than once", () => {
    const clusters = vocabularyClusters(SEED_ENTRIES);

    assert.deepEqual(
      clusters.map((cluster) => cluster.word),
      ["tight", "flutter"],
    );
    assert.equal(clusters[0].dates.length, 4);
  });

  it("is deterministic: the same entries always produce the same counts", () => {
    assert.deepEqual(chosenWordCounts(SEED_ENTRIES), chosenWordCounts([...SEED_ENTRIES]));
  });
});

describe("weeks", () => {
  it("names the weekday of an ISO date without a locale or a clock", () => {
    assert.equal(weekdayOf("2026-10-26"), "Monday");
    assert.equal(weekdayOf("2026-11-01"), "Sunday");
    assert.equal(weekdayOf("not-a-date"), "");
  });

  it("puts a date in the week that starts on its Monday", () => {
    assert.equal(weekStartOf("2026-10-26"), "2026-10-26");
    assert.equal(weekStartOf("2026-11-01"), "2026-10-26");
    assert.equal(weekStartOf("2026-11-02"), "2026-11-02");
  });

  it("splits the seed into the two ISO weeks it spans", () => {
    const drafts = weeklyDrafts(SEED_ENTRIES);

    assert.deepEqual(
      drafts.map((draft) => draft.weekStart),
      ["2026-10-26", "2026-11-02"],
    );
    assert.equal(drafts[0].words.find((word) => word.word === "tight")?.count, 3);
    assert.equal(drafts[1].words.find((word) => word.word === "tight")?.count, 1);
  });
});

describe("roundup draft", () => {
  it("is always a draft", () => {
    assert.equal(buildRoundupDraft(SEED_ENTRIES).status, "draft");
    assert.equal(buildRoundupDraft([]).status, "draft");
  });

  it("reports counts, days, regions, clusters and the user's own sentences", () => {
    const draft = buildRoundupDraft(SEED_ENTRIES);

    assert.ok(draft.text.includes("- tight: 4 times, on Monday, Tuesday, Thursday"));
    assert.ok(draft.text.includes("Regions: shoulders 5"));
    assert.ok(draft.text.includes("- tight: 4 check-ins"));

    for (const seed of SEED_ENTRIES) {
      assert.ok(draft.text.includes(`"${seed.ownSentence}"`), seed.ownSentence);
    }
  });

  it("carries no word that came from neither the template nor the user", () => {
    const draft = buildRoundupDraft(SEED_ENTRIES);

    assert.deepEqual(foreignWords(draft.text, SEED_ENTRIES), []);
  });

  it("says one neutral line when the period holds no check-ins", () => {
    const draft = buildRoundupDraft([]);

    assert.ok(draft.text.includes("No check-ins in this period."));
    assert.deepEqual(foreignWords(draft.text, []), []);
  });

  it("quotes the user's own sentence verbatim, even one the engine may not write", () => {
    const quoted = buildRoundupDraft([entry("2026-10-26", "shoulders", ["tight"], "It is because of the desk")]);

    assert.ok(quoted.text.includes('"It is because of the desk"'));
    assert.deepEqual(findProhibitedLanguage(quoted.text.split("Your own words:")[0]), []);
  });
});

describe("the banned-verb filter", () => {
  it("catches every causal phrase the blueprint lists", () => {
    for (const phrase of CAUSAL_PHRASES) {
      assert.deepEqual(findProhibitedLanguage(`Your week: ${phrase}.`), [phrase], phrase);
    }
  });

  it("catches the condition-name sample, whatever the case or punctuation", () => {
    for (const name of CONDITION_NAME_SAMPLE) {
      assert.ok(findProhibitedLanguage(`A week of ${name}!`).includes(name), name);
      assert.ok(findProhibitedLanguage(`A WEEK OF ${name.toUpperCase()}`).includes(name), name);
    }
  });

  it("lets observational text through", () => {
    assert.deepEqual(findProhibitedLanguage("tight: 4 times, on Monday, Tuesday, Thursday"), []);
    assert.deepEqual(findProhibitedLanguage(""), []);
  });

  it("throws rather than let prohibited language leave the engine", () => {
    assert.throws(() => assertObservational("Your shoulders may mean a long week."), /prohibited language/);
    assert.doesNotThrow(() => assertObservational("flutter: 2 times, on Monday, Friday"));
  });
});
