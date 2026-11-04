import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCardId,
  listJournalCards,
  readJournalCard,
  saveJournalCard,
  updateJournalCard,
  type JournalConfig,
} from "./journalStore.ts";
import type { CardIdentity, SavedCard } from "./journal.ts";

/**
 * The journal's HTTP half - every path exercised with an injected `fetch`, so nothing here needs a
 * network or a database.
 *
 * The properties under test are the ones the milestone exists for: only the five card fields and the
 * session's own columns are ever sent; the user's token travels and no service key is used; a write that
 * did not land is reported as a failure and never as success; and a read answers with the caller's own
 * rows, with anything that is not a card refused rather than shown.
 */

const CONFIG: JournalConfig = {
  baseUrl: "https://project.example",
  anonKey: "publishable-placeholder",
  accessToken: "user-token-placeholder",
  userId: "3f6c1a58-9a4e-4a4f-8a1f-2b0f9c7d5e11",
};

const CARD: SavedCard = {
  location_label: "Upper arm",
  quality_words: ["tiny", "buzzing"],
  intensity_metaphor: "like tiny bubbles",
  duration: "",
  user_own_sentence: "A fictional character describes a small, steady buzzing in the upper arm.",
};

const SESSION_ID = "9b1d2c34-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const CARD_ID = "3f6c1a58-9a4e-4a4f-8a1f-2b0f9c7d5e11";

/** A `fetch` that records what it was asked and answers with the replies given, in order. */
function recordingFetch(replies: readonly { status: number; body: string }[]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
  let index = 0;

  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;

    calls.push({
      url: String(url),
      method: String(init?.method ?? "GET"),
      headers,
      body: typeof init?.body === "string" ? init.body : "",
    });

    const reply = replies[Math.min(index, replies.length - 1)] ?? { status: 500, body: "" };
    index += 1;

    return new Response(reply.body, { status: reply.status });
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

const SESSION_ROW = JSON.stringify([{ id: SESSION_ID }]);
const CARD_ROW = JSON.stringify([{ id: CARD_ID, created_at: "2026-11-02T10:00:00.000Z", ...CARD }]);

describe("saving a card (journal)", () => {
  it("writes the session first, then the card, with only the allowlisted columns", async () => {
    const { calls, fetchImpl } = recordingFetch([
      { status: 201, body: SESSION_ROW },
      { status: 201, body: CARD_ROW },
    ]);

    const result = await saveJournalCard(CONFIG, CARD, "front", fetchImpl);

    // The card's id *and* its session's come back: the screen keeps both, so a rebuild can update this
    // check-in rather than add another (`ISS-24`).
    assert.deepEqual(result, { ok: true, id: CARD_ID, sessionId: SESSION_ID });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://project.example/rest/v1/sessions");
    assert.equal(calls[1].url, "https://project.example/rest/v1/cards");

    const session = JSON.parse(calls[0].body) as Record<string, unknown>;

    assert.deepEqual(Object.keys(session).sort(), ["region_label", "user_id", "view"]);
    assert.equal(session.user_id, CONFIG.userId);
    assert.equal(session.region_label, "Upper arm");
    assert.equal(session.view, "front");

    const card = JSON.parse(calls[1].body) as Record<string, unknown>;

    assert.deepEqual(Object.keys(card).sort(), [
      "duration",
      "intensity_metaphor",
      "location_label",
      "quality_words",
      "session_id",
      "user_own_sentence",
    ]);
    assert.equal(card.session_id, SESSION_ID);

    // The user's own token travels, and no service key exists anywhere in this call.
    assert.equal(calls[0].headers.authorization, `Bearer ${CONFIG.accessToken}`);
    assert.equal(calls[0].headers.apikey, CONFIG.anonKey);
  });

  it("carries no interview answers, acknowledgement, mode or provider text", async () => {
    const { calls, fetchImpl } = recordingFetch([
      { status: 201, body: SESSION_ROW },
      { status: 201, body: CARD_ROW },
    ]);

    await saveJournalCard(CONFIG, CARD, "back", fetchImpl);

    const sent = calls.map((call) => call.body).join(" ");

    for (const forbidden of ["acknowledgedProvider", "answers", "questionId", "MODEL_MODE", "usedFallback", "choices"]) {
      assert.equal(sent.includes(forbidden), false, forbidden);
    }
  });

  it("reports a failed card write as a failure, never as success", async () => {
    const { calls, fetchImpl } = recordingFetch([
      { status: 201, body: SESSION_ROW },
      { status: 403, body: "row-level security" },
    ]);

    const result = await saveJournalCard(CONFIG, CARD, "front", fetchImpl);

    assert.equal(result.ok, false);
    assert.equal(calls.length, 2);
  });

  it("reports a refused session write as a failure, and writes no card", async () => {
    const { calls, fetchImpl } = recordingFetch([{ status: 401, body: "" }]);

    const result = await saveJournalCard(CONFIG, CARD, "front", fetchImpl);

    assert.equal(result.ok, false);
    assert.equal(calls.length, 1);
  });

  it("reports a session write with no id as a failure", async () => {
    const { fetchImpl } = recordingFetch([{ status: 201, body: "[]" }]);

    assert.equal((await saveJournalCard(CONFIG, CARD, "front", fetchImpl)).ok, false);
  });

  it("reports an unreachable service as a failure", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    assert.equal((await saveJournalCard(CONFIG, CARD, "front", fetchImpl)).ok, false);
  });
});

describe("reading the journal (journal)", () => {
  it("asks for the user's own cards, newest first, with the columns the view needs", async () => {
    const { calls, fetchImpl } = recordingFetch([{ status: 200, body: CARD_ROW }]);

    const result = await listJournalCards(CONFIG, fetchImpl);

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes("/rest/v1/cards?select="));
    assert.ok(calls[0].url.includes("order=created_at.desc"));
    // No user_id filter: ownership is derived from the parent session by the policy.
    assert.equal(calls[0].url.includes("user_id"), false);

    if (result.ok) assert.equal(result.records.length, 1);
  });

  it("answers with an empty list when the user has no cards", async () => {
    const { fetchImpl } = recordingFetch([{ status: 200, body: "[]" }]);
    const result = await listJournalCards(CONFIG, fetchImpl);

    assert.equal(result.ok, true);

    if (result.ok) assert.deepEqual(result.records, []);
  });

  it("refuses a list carrying something that is not a card", async () => {
    const { fetchImpl } = recordingFetch([{ status: 200, body: JSON.stringify([{ id: "x" }]) }]);

    assert.equal((await listJournalCards(CONFIG, fetchImpl)).ok, false);
  });

  it("reports a refusal as a failure rather than as an empty journal", async () => {
    const { fetchImpl } = recordingFetch([{ status: 401, body: "" }]);

    assert.equal((await listJournalCards(CONFIG, fetchImpl)).ok, false);
  });

  it("reads one card by id, and answers null without a request when the id is not a uuid", async () => {
    const { calls, fetchImpl } = recordingFetch([{ status: 200, body: CARD_ROW }]);

    assert.equal(isCardId(CARD_ID), true);
    assert.equal(isCardId("not-a-uuid"), false);
    assert.equal(isCardId(`${CARD_ID} or 1=1`), false);

    const result = await readJournalCard(CONFIG, "not-a-uuid", fetchImpl);

    assert.deepEqual(result, { ok: true, record: null });
    assert.equal(calls.length, 0);
  });

  it("answers null when this user has no such card, and the row when they do", async () => {
    const missing = recordingFetch([{ status: 200, body: "[]" }]);
    const found = recordingFetch([{ status: 200, body: CARD_ROW }]);

    assert.deepEqual(await readJournalCard(CONFIG, CARD_ID, missing.fetchImpl), { ok: true, record: null });

    const result = await readJournalCard(CONFIG, CARD_ID, found.fetchImpl);

    assert.equal(result.ok, true);
    assert.ok(found.calls[0].url.includes(`id=eq.${CARD_ID}`));

    if (result.ok && result.record !== null) assert.equal(result.record.id, CARD_ID);
  });
});

/**
 * Updating a saved card (`ISS-24`).
 *
 * `Edit my answers` and `Change the region` rebuild a card from the answers the session already holds, and
 * the journal must keep one entry per check-in: a rebuild reaches the row that already exists. The path is
 * the insert path's mirror - the same two tables, the same allowlisted columns, the same failure rule -
 * with `PATCH` and an id instead of `POST` and a new row. Nothing here inserts anything, and a write that
 * did not land is never reported as a save.
 */
describe("updating a saved card (ISS-24)", () => {
  const IDENTITY: CardIdentity = { cardId: CARD_ID, sessionId: SESSION_ID };
  /** The same check-in after the user changed the region: one field moved, the rest is untouched. */
  const UPDATED: SavedCard = { ...CARD, location_label: "Head" };

  it("updates the session and the card in place, and inserts nothing", async () => {
    const { calls, fetchImpl } = recordingFetch([
      { status: 200, body: SESSION_ROW },
      { status: 200, body: CARD_ROW },
    ]);

    const result = await updateJournalCard(CONFIG, UPDATED, "back", IDENTITY, fetchImpl);

    assert.deepEqual(result, { ok: true, id: CARD_ID, sessionId: SESSION_ID });
    assert.equal(calls.length, 2);
    assert.equal(calls.some((call) => call.method === "POST"), false, "a rebuild never inserts");

    // The session first, then the card - the same order the insert path writes them in.
    assert.equal(calls[0].method, "PATCH");
    assert.equal(calls[0].url, `https://project.example/rest/v1/sessions?id=eq.${SESSION_ID}`);
    assert.deepEqual(Object.keys(JSON.parse(calls[0].body) as object).sort(), ["region_label", "view"]);
    assert.equal((JSON.parse(calls[0].body) as { region_label: string }).region_label, "Head");

    assert.equal(calls[1].method, "PATCH");
    assert.equal(calls[1].url, `https://project.example/rest/v1/cards?id=eq.${CARD_ID}`);
  });

  it("sends the card's five fields and nothing else, and never re-points its session", async () => {
    const { calls, fetchImpl } = recordingFetch([
      { status: 200, body: SESSION_ROW },
      { status: 200, body: CARD_ROW },
    ]);

    await updateJournalCard(CONFIG, UPDATED, "back", IDENTITY, fetchImpl);

    const body = JSON.parse(calls[1].body) as Record<string, unknown>;

    assert.deepEqual(Object.keys(body).sort(), [
      "duration",
      "intensity_metaphor",
      "location_label",
      "quality_words",
      "user_own_sentence",
    ]);
    assert.equal("session_id" in body, false, "the session a card belongs to never changes");
    // The card travels exactly as the session produced it: one field moved because the user moved it, and
    // their words and their sentence are untouched.
    assert.deepEqual(body, UPDATED);
    assert.deepEqual(body.quality_words, CARD.quality_words);
    assert.equal(body.user_own_sentence, CARD.user_own_sentence);
    assert.equal(body.intensity_metaphor, CARD.intensity_metaphor);

    // The user's own token travels here too, and no service key exists anywhere in this call.
    assert.equal(calls[0].headers.authorization, `Bearer ${CONFIG.accessToken}`);
    assert.equal(calls[1].headers.apikey, CONFIG.anonKey);
  });

  it("carries no interview answers, acknowledgement, mode or provider text", async () => {
    const { calls, fetchImpl } = recordingFetch([
      { status: 200, body: SESSION_ROW },
      { status: 200, body: CARD_ROW },
    ]);

    await updateJournalCard(CONFIG, UPDATED, "front", IDENTITY, fetchImpl);

    const sent = calls.map((call) => call.body).join(" ");

    for (const forbidden of ["acknowledgedProvider", "answers", "questionId", "MODEL_MODE", "usedFallback", "choices"]) {
      assert.equal(sent.includes(forbidden), false, forbidden);
    }
  });

  it("a second update of the same card adds no row", async () => {
    const { calls, fetchImpl } = recordingFetch([
      { status: 200, body: SESSION_ROW },
      { status: 200, body: CARD_ROW },
      { status: 200, body: SESSION_ROW },
      { status: 200, body: CARD_ROW },
    ]);

    await updateJournalCard(CONFIG, UPDATED, "front", IDENTITY, fetchImpl);
    const second = await updateJournalCard(CONFIG, CARD, "front", IDENTITY, fetchImpl);

    assert.deepEqual(second, { ok: true, id: CARD_ID, sessionId: SESSION_ID });
    assert.equal(calls.length, 4, "two updates, two requests each");
    assert.equal(calls.filter((call) => call.method === "POST").length, 0, "no second card, ever");
    assert.equal(new Set(calls.map((call) => call.url)).size, 2, "and always the same two rows");
  });

  it("refuses an identity that is not a pair of ids, without a request", async () => {
    const { calls, fetchImpl } = recordingFetch([]);

    for (const identity of [
      { cardId: "not-a-uuid", sessionId: SESSION_ID },
      { cardId: CARD_ID, sessionId: "not-a-uuid" },
      { cardId: `${CARD_ID} or 1=1`, sessionId: SESSION_ID },
      { cardId: "", sessionId: "" },
    ]) {
      const result = await updateJournalCard(CONFIG, CARD, "front", identity, fetchImpl);

      assert.equal(result.ok, false, JSON.stringify(identity));
    }

    assert.equal(calls.length, 0, "an id this build will not put in a query is never sent");
  });

  it("reports a row the caller may not touch as a failure, never as a save", async () => {
    // Row-level security answers a row that is not this user's with an empty representation rather than an
    // error, so "no row came back" is the shape an unauthorized update takes. It must never read as success
    // - and because it answers exactly as an id that does not exist does, this path cannot be used to test
    // whether someone else's id is real.
    const { calls, fetchImpl } = recordingFetch([
      { status: 200, body: "[]" },
      { status: 200, body: "[]" },
    ]);

    const result = await updateJournalCard(CONFIG, CARD, "front", IDENTITY, fetchImpl);

    assert.equal(result.ok, false);
    assert.equal(calls.length, 1, "the card is not touched when its session was not");
  });

  it("reports a card that no longer exists as a failure, after the session update landed", async () => {
    const { calls, fetchImpl } = recordingFetch([
      { status: 200, body: SESSION_ROW },
      { status: 200, body: "[]" },
    ]);

    const result = await updateJournalCard(CONFIG, CARD, "front", IDENTITY, fetchImpl);

    assert.equal(result.ok, false);
    assert.equal(calls.length, 2);
  });

  it("reports a refused update as a failure, whichever of the two writes is refused", async () => {
    const refusedSession = recordingFetch([{ status: 401, body: "" }]);
    const refusedCard = recordingFetch([
      { status: 200, body: SESSION_ROW },
      { status: 403, body: "row-level security" },
    ]);

    assert.equal((await updateJournalCard(CONFIG, CARD, "front", IDENTITY, refusedSession.fetchImpl)).ok, false);
    assert.equal(refusedSession.calls.length, 1, "the card is not written when the session was refused");

    assert.equal((await updateJournalCard(CONFIG, CARD, "front", IDENTITY, refusedCard.fetchImpl)).ok, false);
    assert.equal(refusedCard.calls.length, 2, "and the failure is reported even though the session landed");
  });

  it("reports an unreachable service as a failure", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    assert.equal((await updateJournalCard(CONFIG, CARD, "front", IDENTITY, fetchImpl)).ok, false);
  });
});
