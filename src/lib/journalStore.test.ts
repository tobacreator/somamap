import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCardId, listJournalCards, readJournalCard, saveJournalCard, type JournalConfig } from "./journalStore.ts";
import type { SavedCard } from "./journal.ts";

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

    assert.deepEqual(result, { ok: true, id: CARD_ID });
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
