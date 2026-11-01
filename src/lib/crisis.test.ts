import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CRISIS_LEXICON,
  CRISIS_RESOURCES,
  EMPTY_CHECK_IN_STATE,
  backToEmptyCheckIn,
  checkInFlowAfterSubmit,
  gateForInput,
  isCrisisLanguage,
  matchedCrisisPhrase,
} from "./crisis.ts";

/**
 * The crisis shield's tests - iron rule 4, blueprint Table 7 (T1) and Table 10 stage 1.
 *
 * Deterministic throughout: the lexicon and the gate are pure functions, so nothing here
 * needs a model, a network or a database.
 */

describe("crisis shield", () => {
  it("stops the loop on the phrase Table 7 uses", () => {
    const flow = checkInFlowAfterSubmit("I want to hurt myself");

    assert.equal(flow.screen, "crisis");
    assert.equal(flow.crisisMatch, "hurt myself");
    assert.equal(flow.boxText, "");
  });

  it("stops on every lexicon phrase, whatever the case or punctuation", () => {
    for (const phrase of CRISIS_LEXICON) {
      assert.equal(isCrisisLanguage(phrase), true, phrase);
      assert.equal(isCrisisLanguage(`...${phrase.toUpperCase()}!!!`), true, phrase);
      assert.notEqual(matchedCrisisPhrase(phrase), null, phrase);
    }
  });

  it("does not stop on ordinary check-in text", () => {
    const ordinary = [
      "",
      "   ",
      "my knee hurts",
      "hurt my back lifting a box",
      "tight and heavy across the shoulders",
      "it comes and goes in waves",
      "like a warm bath, or a heavy blanket",
      "sore after a long walk",
      "I am exhausted today",
    ];

    for (const text of ordinary) {
      assert.equal(isCrisisLanguage(text), false, JSON.stringify(text));
      assert.equal(gateForInput(text).stop, false, JSON.stringify(text));
    }
  });

  it("hands the caller nothing to save and no card to render", () => {
    const flow = checkInFlowAfterSubmit("I want to hurt myself");
    const gate = gateForInput("I want to hurt myself");

    assert.deepEqual(Object.keys(flow).sort(), ["boxText", "crisisMatch", "screen"]);
    assert.deepEqual(Object.keys(gate).sort(), ["matched", "screen", "stop"]);
  });

  it("keeps the words in the box when the loop continues, and saves nothing", () => {
    const flow = checkInFlowAfterSubmit("tight across the shoulders");

    assert.equal(flow.screen, "check-in");
    assert.equal(flow.boxText, "tight across the shoulders");
    assert.equal(flow.crisisMatch, null);
  });

  it("shows the blueprint's contact details and nothing invented", () => {
    const shown = CRISIS_RESOURCES.map((resource) => `${resource.region}: ${resource.action}`).join(" | ");

    assert.equal(CRISIS_RESOURCES.length, 4);
    assert.ok(shown.includes("988"), shown);
    assert.ok(shown.includes("116 123"), shown);
    assert.ok(shown.includes("112"), shown);
    assert.ok(shown.includes("findahelpline.com"), shown);
  });

  it("returns to an empty check-in on back navigation", () => {
    const back = backToEmptyCheckIn();

    assert.deepEqual(back, EMPTY_CHECK_IN_STATE);
    assert.equal(back.screen, "check-in");
    assert.equal(back.boxText, "");
    assert.equal(back.crisisMatch, null);
  });
});
