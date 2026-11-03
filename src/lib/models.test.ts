import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interviewFixture } from "./fixtures.ts";
import {
  adapterFor,
  mockAdapter,
  modelMode,
  unavailableAdapter,
  validateDraftCard,
  wordCard,
  type ViolationRecord,
} from "./models.ts";
import { FALLBACK_CARD } from "./schema.ts";

/**
 * The model boundary's tests - blueprint Chapter 4.3 and Table 10.
 *
 * Everything here is mock mode and fixtures: no provider, no network, no environment.
 * The recorded invalid draft stands in for a model that tried to add a field it is not
 * allowed to add.
 */

const SNAPSHOT = { answers: [{ questionId: "Q1", text: "tight across the shoulders" }] };

function collectingLogger(): { records: ViolationRecord[]; logger: (record: ViolationRecord) => void } {
  const records: ViolationRecord[] = [];

  return { records, logger: (record) => records.push(record) };
}

describe("model mode", () => {
  it("defaults to mock and only switches on an explicit live", () => {
    assert.equal(modelMode({}), "mock");
    assert.equal(modelMode({ MODEL_MODE: "mock" }), "mock");
    assert.equal(modelMode({ MODEL_MODE: "anything-else" }), "mock");
    assert.equal(modelMode({ MODEL_MODE: "live" }), "live");
  });

  it("picks the fixture adapter in mock mode and the failing one in live mode", () => {
    assert.equal(adapterFor("mock"), mockAdapter);
    assert.equal(adapterFor("live"), unavailableAdapter);
  });
});

describe("the adapters (Phase 2C)", () => {
  it("asks the reviewed questions in both modes", () => {
    assert.deepEqual(mockAdapter.questionSequence(), interviewFixture.question_ids);
    assert.deepEqual(
      unavailableAdapter.questionSequence(),
      interviewFixture.question_ids,
      "the sequence is a product decision, not a provider one",
    );
  });

  it("carries no crisis decision of its own, in either mode", () => {
    // The shield belongs to interviewStep and the local lexicon (src/lib/crisis.ts). Neither adapter
    // has a member that could decide it, so no provider status - down, slow, throwing or absent - can
    // ever produce a crisis screen, and none can suppress one either.
    assert.equal("prescreen" in mockAdapter, false);
    assert.equal("prescreen" in unavailableAdapter, false);
  });
});

describe("draft validation", () => {
  it("accepts the recorded valid draft", () => {
    const validation = validateDraftCard(interviewFixture.draft_card);

    assert.equal(validation.ok, true);
  });

  it("refuses the recorded invalid draft and names both extra keys", () => {
    const validation = validateDraftCard(interviewFixture.invalid_draft_card);

    assert.equal(validation.ok, false);

    if (validation.ok) return;

    assert.equal(validation.reason, "unrecognized_keys");
    assert.deepEqual(
      validation.reason === "unrecognized_keys" ? [...validation.keys].sort() : [],
      ["possible_cause", "recommendation"],
    );
  });

  it("refuses anything that is not a card at all", () => {
    for (const payload of [null, 42, "a card", [], {}, { location_label: "shoulder" }]) {
      const validation = validateDraftCard(payload);

      assert.equal(validation.ok, false, JSON.stringify(payload));
    }
  });
});

describe("wordCard", () => {
  it("accepts a valid draft without refusing it, and records nothing", async () => {
    const { records, logger } = collectingLogger();
    const worded = await wordCard(SNAPSHOT, {
      adapter: { ...mockAdapter, interview: async () => interviewFixture.draft_card },
      logger,
      mode: "mock",
    });

    assert.equal(worded.usedFallback, false);
    assert.deepEqual(records, []);

    // Phase 2A: a valid draft is no longer used as itself. The recorded fixture's region, duration
    // and sentence are not **this** session's - the session typed only "tight across the shoulders" -
    // so they are grounded away rather than shown as the user's own. The grounding itself is proven
    // case by case in `cardFidelity.modelDraft.test.ts`.
    assert.notDeepEqual(worded.card, interviewFixture.draft_card);
    assert.equal(worded.card.location_label, "", "no region was selected, so no region is named");
    assert.equal(worded.card.duration, "", "the session said nothing about how long");
    assert.equal(worded.card.user_own_sentence, SNAPSHOT.answers[0].text, "the user's own words");
  });

  it("builds mock mode's card from the snapshot instead of replaying the fixture", async () => {
    const { records, logger } = collectingLogger();
    const worded = await wordCard(SNAPSHOT, { adapter: mockAdapter, logger, mode: "mock" });

    assert.equal(worded.usedFallback, false);
    assert.deepEqual(records, []);

    // Entry 42: mock mode used to return the recorded draft verbatim, so a session could show a
    // sentence the user never typed. It now derives the card from what the session supplied.
    assert.notDeepEqual(worded.card, interviewFixture.draft_card);
    assert.deepEqual(worded.card, {
      location_label: "",
      quality_words: ["tight", "shoulders"],
      intensity_metaphor: "",
      duration: "",
      user_own_sentence: SNAPSHOT.answers[0].text,
    });
  });

  it("gives the reviewed fallback the user's own sentence and duration", async () => {
    const { records, logger } = collectingLogger();
    const snapshot = {
      answers: [
        { questionId: "Q1", text: "a tight band around my forehead" },
        { questionId: "Q2", text: "like a wet cloth" },
        { questionId: "Q12", text: "since this morning" },
      ],
      regionLabel: "head",
    };
    const worded = await wordCard(snapshot, {
      adapter: { ...mockAdapter, interview: async () => interviewFixture.invalid_draft_card },
      logger,
      mode: "mock",
    });

    assert.equal(worded.usedFallback, true);
    assert.equal(records.length, 1);
    // The reviewed fallback's own copy stands for what a model would have worded...
    assert.deepEqual(worded.card.quality_words, FALLBACK_CARD.quality_words);
    assert.equal(worded.card.intensity_metaphor, FALLBACK_CARD.intensity_metaphor);
    // ...while the fields the session can supply are the user's own, not placeholders.
    assert.equal(worded.card.location_label, "head");
    assert.equal(worded.card.duration, "since this morning");
    assert.equal(worded.card.user_own_sentence, "a tight band around my forehead");
  });

  it("substitutes the reviewed fallback and records the refusal safely", async () => {
    const { records, logger } = collectingLogger();
    const worded = await wordCard(SNAPSHOT, {
      adapter: { ...mockAdapter, interview: async () => interviewFixture.invalid_draft_card },
      logger,
      mode: "mock",
    });

    assert.equal(worded.usedFallback, true);
    assert.equal(records.length, 1);
    assert.equal(records[0].event, "model-output-rejected");
    assert.equal(records[0].reason, "unrecognized_keys");
    assert.deepEqual([...records[0].keys].sort(), ["possible_cause", "recommendation"]);
    assert.deepEqual(records[0].questions, ["Q1"]);
    assert.equal(records[0].mode, "mock");
  });

  it("records categories only: never the answer text, never the refused values", async () => {
    const { records, logger } = collectingLogger();

    await wordCard(SNAPSHOT, {
      adapter: { ...mockAdapter, interview: async () => interviewFixture.invalid_draft_card },
      logger,
      mode: "mock",
    });

    const serialised = JSON.stringify(records);

    for (const value of [
      SNAPSHOT.answers[0].text,
      interviewFixture.invalid_draft_card.possible_cause,
      interviewFixture.invalid_draft_card.recommendation,
    ]) {
      assert.equal(serialised.includes(value), false, value);
    }
  });

  it("fails closed to the fallback when the provider cannot answer", async () => {
    const { records, logger } = collectingLogger();
    const worded = await wordCard(SNAPSHOT, {
      adapter: { ...mockAdapter, interview: async () => { throw new Error("provider down"); } },
      logger,
      mode: "live",
    });

    assert.equal(worded.usedFallback, true);
    assert.equal(records.length, 1);
    assert.equal(records[0].reason, "provider-unavailable");
    assert.deepEqual(records[0].keys, []);
  });

  it("fails closed through the unavailable adapter", async () => {
    const { records, logger } = collectingLogger();
    const worded = await wordCard(SNAPSHOT, { adapter: unavailableAdapter, logger, mode: "live" });

    assert.equal(worded.usedFallback, true);
    assert.equal(records[0].reason, "provider-unavailable");
  });
});
