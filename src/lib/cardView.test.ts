import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CARD_FIELD_LABELS, CARD_NOT_ANSWERED, DISCLAIMER_LINE } from "./copy.ts";
import { CARD_FIELD_ORDER, PLACEHOLDER_VALUES, cardViewForPayload, displayRows } from "./cardView.ts";
import { FALLBACK_CARD, sensationCardSchema } from "./schema.ts";

/**
 * The card view's tests - blueprint Section 6.1 and the runtime lock in 4.2.
 *
 * The render model is the single source of what CardView shows, so proving the model is
 * proving the card's content: a rejected payload renders the reviewed fallback, a hostile
 * key's text has no path to a row, and a placeholder is never displayed as an answer.
 */

/** A card the user actually completed, in the user's own words. */
const COMPLETED_CARD = {
  location_label: "shoulder",
  quality_words: ["tight", "heavy"],
  intensity_metaphor: "like a scarf knotted too tight",
  duration: "since this morning",
  user_own_sentence: "It feels like a scarf knotted too tight across my shoulders.",
};

describe("card view", () => {
  it("renders a completed card verbatim, with all five fields answered", () => {
    const view = cardViewForPayload(COMPLETED_CARD);

    assert.equal(view.usedFallback, false);
    assert.deepEqual(
      view.rows.map((row) => row.field),
      [...CARD_FIELD_ORDER],
    );
    assert.ok(view.rows.every((row) => row.answered));
    assert.deepEqual(
      view.rows.map((row) => row.display),
      [
        "shoulder",
        "tight, heavy",
        "like a scarf knotted too tight",
        "since this morning",
        "It feels like a scarf knotted too tight across my shoulders.",
      ],
    );
  });

  it("keeps the five rows in schema order and labels them from the copy module", () => {
    const view = cardViewForPayload(COMPLETED_CARD);

    for (const row of view.rows) {
      assert.equal(row.label, CARD_FIELD_LABELS[row.field]);
    }
    assert.deepEqual(Object.keys(CARD_FIELD_LABELS).sort(), [...CARD_FIELD_ORDER].sort());
    assert.deepEqual(Object.keys(sensationCardSchema.shape).sort(), [...CARD_FIELD_ORDER].sort());
  });

  it("renders the reviewed fallback when the payload is rejected", () => {
    const view = cardViewForPayload({ ...FALLBACK_CARD, possible_cause: "a long day at the desk" });

    assert.equal(view.usedFallback, true);
    assert.equal(view.rows.length, 5);
    assert.equal(view.rows[0].display, CARD_NOT_ANSWERED);
  });

  it("never displays a placeholder as an answer", () => {
    const view = cardViewForPayload(FALLBACK_CARD);

    for (const row of view.rows) {
      assert.equal(PLACEHOLDER_VALUES.includes(row.display), false, `${row.field} displayed a placeholder`);
    }

    const unanswered = view.rows.filter((row) => !row.answered);

    assert.equal(unanswered.length, PLACEHOLDER_VALUES.length);
    assert.ok(unanswered.every((row) => row.display === CARD_NOT_ANSWERED));
  });

  it("cannot display text smuggled in through an extra key", () => {
    const view = cardViewForPayload({
      ...COMPLETED_CARD,
      possible_cause: "a long day at the desk",
      recommendation: "rest and drink water",
    });
    const displayed = view.rows.map((row) => row.display).join(" | ");

    assert.equal(view.usedFallback, true);
    assert.equal(displayed.includes("a long day at the desk"), false);
    assert.equal(displayed.includes("rest and drink water"), false);
  });

  it("displays the user's own words as written, without rewriting them", () => {
    const sentence = "It feels like a scarf knotted too tight across my shoulders.";
    const view = cardViewForPayload({ ...COMPLETED_CARD, user_own_sentence: sentence });

    assert.equal(view.rows.find((row) => row.field === "user_own_sentence")?.display, sentence);
  });

  it("renders the fixed line on the card", () => {
    assert.equal(cardViewForPayload(COMPLETED_CARD).disclaimer, DISCLAIMER_LINE);
  });
});

/**
 * Correction 2, after the owner's UAT: the shipped three questions never ask how long, so a session's
 * card carries an empty duration. That row is hidden rather than shown as a permanent "Not answered
 * yet" - a missing answer to a question the user was never asked - while every other row keeps its
 * explicit unanswered state.
 */
describe("the rows the card screen renders (correction 2)", () => {
  it("hides the duration row while no duration has been collected", () => {
    const view = cardViewForPayload({ ...COMPLETED_CARD, duration: "" });
    const shown = displayRows(view);

    assert.deepEqual(
      shown.map((row) => row.field),
      ["location_label", "quality_words", "intensity_metaphor", "user_own_sentence"],
      "the duration row is not rendered at all",
    );

    // Nothing is displayed in its place, and the model itself still holds all five fields.
    assert.equal(view.rows.length, 5);
    assert.equal(view.rows.find((row) => row.field === "duration")?.display, CARD_NOT_ANSWERED);
    assert.equal(
      shown.some((row) => row.display === CARD_NOT_ANSWERED && row.field === "duration"),
      false,
    );
  });

  it("shows the duration row, verbatim, once a duration has been collected", () => {
    const shown = displayRows(cardViewForPayload(COMPLETED_CARD));

    assert.deepEqual(shown.map((row) => row.field), [...CARD_FIELD_ORDER]);
    assert.equal(shown.find((row) => row.field === "duration")?.display, "since this morning");
  });

  it("hides the fallback's unanswered duration too, and only that row", () => {
    const shown = displayRows(cardViewForPayload(FALLBACK_CARD));

    assert.equal(shown.some((row) => row.field === "duration"), false);
    assert.equal(shown.length, 4, "the other four rows still render");
    // The rows that stand for something the user can still supply keep their explicit unanswered
    // state, so a placeholder is never presented as an answer.
    assert.ok(shown.some((row) => row.display === CARD_NOT_ANSWERED));
  });
});
