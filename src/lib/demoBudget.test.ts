import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GLOBAL_LIMIT,
  INTERVIEW_BODY_MAX_BYTES,
  INTERVIEW_DESCRIPTION_MAX_LENGTH,
  INTERVIEW_REGION_MAX_LENGTH,
  INTERVIEW_TEXT_MAX_LENGTH,
  MAX_TRACKED_VISITORS,
  VISITOR_LIMIT,
  VISITOR_WINDOW_MS,
  createDemoBudget,
  oversizedField,
  visitorKeyFrom,
} from "./demoBudget.ts";

/**
 * The public demo's abuse guard (`ISS-27`), exercised without a clock, a server or a model.
 *
 * Every test builds its own budget through `createDemoBudget`, so the tests share no state and do not
 * depend on the order they run in, and every window is driven by passing `now` rather than by waiting for
 * real time. Nothing here reads a key or makes a request: the module counts requests and measures strings.
 */

describe("the interview's input caps", () => {
  it("accepts a field at exactly its cap and refuses one character more", () => {
    assert.equal(oversizedField({ text: "a".repeat(INTERVIEW_TEXT_MAX_LENGTH) }), null);
    assert.equal(oversizedField({ text: "a".repeat(INTERVIEW_TEXT_MAX_LENGTH + 1) }), "text");

    assert.equal(oversizedField({ description: "a".repeat(INTERVIEW_DESCRIPTION_MAX_LENGTH) }), null);
    assert.equal(
      oversizedField({ description: "a".repeat(INTERVIEW_DESCRIPTION_MAX_LENGTH + 1) }),
      "description",
    );

    assert.equal(oversizedField({ regionLabel: "a".repeat(INTERVIEW_REGION_MAX_LENGTH) }), null);
    assert.equal(oversizedField({ regionLabel: "a".repeat(INTERVIEW_REGION_MAX_LENGTH + 1) }), "region");
  });

  it("measures the answers already given, not only the one on screen", () => {
    const long = "a".repeat(INTERVIEW_TEXT_MAX_LENGTH + 1);

    assert.equal(oversizedField({ answers: [{ questionId: "Q1", text: long }] }), "answer");
    assert.equal(
      oversizedField({ answers: [{ questionId: "Q1", text: "tight" }, { questionId: "Q4", text: long }] }),
      "answer",
    );
    assert.equal(oversizedField({ answers: [{ questionId: "Q1", text: "tight" }] }), null);
  });

  it("leaves everything that is not a string, or not a body, to the state machine", () => {
    // The state machine's own parser refuses these; this function must not change what it accepts.
    for (const body of [null, "a string", 42, [], { text: 42 }, { description: null }, { answers: "no" }]) {
      assert.equal(oversizedField(body), null, JSON.stringify(body));
    }

    assert.equal(oversizedField({ answers: [null, "no", 7] }), null);
  });

  it("keeps the caps mutually consistent, so a legal body fits inside the body cap", () => {
    // Three answers plus a description plus a location, at their own caps, must fit in one body.
    const widest =
      3 * INTERVIEW_TEXT_MAX_LENGTH + INTERVIEW_DESCRIPTION_MAX_LENGTH + INTERVIEW_REGION_MAX_LENGTH;

    assert.ok(widest < INTERVIEW_BODY_MAX_BYTES, `${widest} must fit inside ${INTERVIEW_BODY_MAX_BYTES}`);
  });

  it("leaves room for a real answer, and for a judge's whole session", () => {
    // A cap that refused an ordinary answer would break the demo rather than protect it.
    assert.ok(INTERVIEW_TEXT_MAX_LENGTH >= 200, "an answer needs room for a sentence or two");
    // One session is four turns; an edit replays up to three more; a person may try twice.
    assert.ok(VISITOR_LIMIT >= 12, "a visitor must be able to finish a session and experiment with the card");
    assert.ok(GLOBAL_LIMIT > VISITOR_LIMIT, "the instance backstop must sit above one visitor's window");
  });
});

describe("the visitor key", () => {
  const headers = (values: Record<string, string>): { get(name: string): string | null } => ({
    get: (name) => values[name] ?? null,
  });

  it("takes the last hop, because a client can send a header of its own", () => {
    assert.equal(visitorKeyFrom(headers({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
    assert.equal(visitorKeyFrom(headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.9" })), "203.0.113.9");
    assert.equal(visitorKeyFrom(headers({ "x-forwarded-for": " 203.0.113.9 , " })), "203.0.113.9");
  });

  it("falls back to the single-address header, then to one shared bucket", () => {
    assert.equal(visitorKeyFrom(headers({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
    assert.equal(visitorKeyFrom(headers({ "x-forwarded-for": "  " })), "unknown");
    assert.equal(visitorKeyFrom(headers({})), "unknown");
  });

  it("bounds the key it keeps, so a header cannot become a long-lived map key", () => {
    assert.equal(visitorKeyFrom(headers({ "x-forwarded-for": "a".repeat(300) })).length, 64);
  });
});

describe("the request budget", () => {
  it("admits up to the visitor's limit and refuses the turn after it", () => {
    const budget = createDemoBudget({ visitorLimit: 3, visitorWindowMs: 1_000 });

    assert.deepEqual(budget.admit("a", 0), { ok: true });
    assert.deepEqual(budget.admit("a", 0), { ok: true });
    assert.deepEqual(budget.admit("a", 0), { ok: true });
    assert.deepEqual(budget.admit("a", 0), { ok: false, scope: "visitor" });
  });

  it("counts each visitor separately", () => {
    const budget = createDemoBudget({ visitorLimit: 1, visitorWindowMs: 1_000 });

    assert.deepEqual(budget.admit("a", 0), { ok: true });
    assert.deepEqual(budget.admit("b", 0), { ok: true });
    assert.deepEqual(budget.admit("a", 0), { ok: false, scope: "visitor" });
    assert.deepEqual(budget.admit("b", 0), { ok: false, scope: "visitor" });
  });

  it("forgets a window once it has passed, so a person is not locked out for ever", () => {
    const budget = createDemoBudget({ visitorLimit: 2, visitorWindowMs: 1_000 });

    assert.deepEqual(budget.admit("a", 0), { ok: true });
    assert.deepEqual(budget.admit("a", 500), { ok: true });
    assert.deepEqual(budget.admit("a", 900), { ok: false, scope: "visitor" });
    // Both stamps are older than the window by now, so the visitor starts again.
    assert.deepEqual(budget.admit("a", 2_000), { ok: true });
  });

  it("refuses a fresh visitor once the instance's own counter is spent", () => {
    const budget = createDemoBudget({ visitorLimit: 5, globalLimit: 2, visitorWindowMs: 1_000 });

    assert.deepEqual(budget.admit("a", 0), { ok: true });
    assert.deepEqual(budget.admit("b", 0), { ok: true });
    // A visitor who has never asked for anything is still refused: this is the backstop, not the window.
    assert.deepEqual(budget.admit("c", 0), { ok: false, scope: "global" });
  });

  it("lets the instance serve again once its window has passed", () => {
    const budget = createDemoBudget({ globalLimit: 1, globalWindowMs: 1_000, visitorWindowMs: 1_000 });

    assert.deepEqual(budget.admit("a", 0), { ok: true });
    assert.deepEqual(budget.admit("b", 10), { ok: false, scope: "global" });
    assert.deepEqual(budget.admit("b", 1_001), { ok: true });
  });

  it("keeps its memory bounded when callers keep arriving", () => {
    const budget = createDemoBudget({ maxTrackedVisitors: 2, visitorLimit: 1, globalLimit: 100 });

    for (const visitor of ["a", "b", "c", "d", "e"]) budget.admit(visitor, 0);

    assert.ok(budget.trackedVisitors() <= 2, `held ${budget.trackedVisitors()} windows`);
    assert.ok(MAX_TRACKED_VISITORS >= 2, "the shipped bound must hold at least a handful of visitors");
  });

  it("shares nothing between instances, which is what keeps the tests independent", () => {
    const first = createDemoBudget({ visitorLimit: 1, visitorWindowMs: 1_000 });
    const second = createDemoBudget({ visitorLimit: 1, visitorWindowMs: 1_000 });

    assert.deepEqual(first.admit("a", 0), { ok: true });
    assert.deepEqual(second.admit("a", 0), { ok: true }, "the second budget must start empty");
  });

  it("ships windows measured in minutes, not seconds", () => {
    assert.ok(VISITOR_WINDOW_MS >= 60_000, "a window shorter than a minute would break a slow reader");
  });
});

