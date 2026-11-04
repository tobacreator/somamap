import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cardWithEdits, saveEditedCard } from "./cardEdit.ts";
import type { CardIdentity, SavedCard } from "./journal.ts";

/**
 * Editing a saved card (`ISS-25`).
 *
 * The card in the journal used to be readable and nothing else, because the product's only editing lived
 * in the interview - and the interview cannot be reopened from a stored card, since the answers it would
 * resume from are not in the database. These tests hold the replacement to what the product promises: the
 * two fields a person can change are the two they changed, the three they did not touch travel exactly as
 * stored, the write addresses the row the card already occupies, and no reply that is not a confirmed
 * update is ever reported as a save.
 *
 * Everything here runs against an injected `fetch`: no network, no database, no provider.
 */

const IDENTITY: CardIdentity = {
  cardId: "0212412f-bb4e-43b7-8251-5018b0d70895",
  sessionId: "9b1d2c34-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
};

/** The founder's card, as the database holds it. */
const CARD: SavedCard = {
  location_label: "shoulder",
  quality_words: ["tight"],
  intensity_metaphor: "a heavy knock",
  duration: "",
  user_own_sentence: "Don't know how to describe it",
};

const CONFIRMED = {
  status: 200,
  body: JSON.stringify({ ok: true, id: IDENTITY.cardId, sessionId: IDENTITY.sessionId }),
};

/** A `fetch` that records what it was asked and answers with the replies given, in order. */
function recordingFetch(replies: readonly { status: number; body: string }[]) {
  const calls: { url: string; method: string; body: string }[] = [];
  let index = 0;

  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: String(init?.method ?? "GET"),
      body: typeof init?.body === "string" ? init.body : "",
    });

    const reply = replies[Math.min(index, replies.length - 1)] ?? { status: 500, body: "" };
    index += 1;

    return new Response(reply.body, { status: reply.status });
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

describe("the card an edit writes", () => {
  it("changes the sentence and the region, and hands every other row on untouched", () => {
    const edited = cardWithEdits(CARD, { sentence: "A heavy knock on my shoulder", region: "left shoulder" });

    assert.equal(edited.user_own_sentence, "A heavy knock on my shoulder");
    assert.equal(edited.location_label, "left shoulder");

    // The three rows this screen does not offer, exactly as stored.
    assert.deepEqual(edited.quality_words, ["tight"]);
    assert.equal(edited.intensity_metaphor, "a heavy knock");
    assert.equal(edited.duration, "");

    assert.deepEqual(Object.keys(edited).sort(), [
      "duration",
      "intensity_metaphor",
      "location_label",
      "quality_words",
      "user_own_sentence",
    ]);
  });

  it("keeps the person's sentence exactly as typed", () => {
    for (const sentence of ["Don't know how to describe it", "  two spaces  ", "It's a knot, isn't it?", ""]) {
      assert.equal(cardWithEdits(CARD, { sentence, region: "shoulder" }).user_own_sentence, sentence);
    }
  });

  it("does not mutate the card the server sent", () => {
    const before = JSON.stringify(CARD);

    cardWithEdits(CARD, { sentence: "something else entirely", region: "knee" });

    assert.equal(JSON.stringify(CARD), before, "the stored card is copied, never written through");
  });
});

describe("saving an edit", () => {
  it("updates the row the card already occupies, and inserts nothing", async () => {
    const { calls, fetchImpl } = recordingFetch([CONFIRMED]);
    const edited = cardWithEdits(CARD, { sentence: "a heavy knock", region: "shoulder" });

    const outcome = await saveEditedCard(IDENTITY, edited, "front", fetchImpl);

    assert.deepEqual(outcome, { ok: true });
    assert.equal(calls.length, 1, "one request, one card");
    assert.equal(calls[0].url, "/api/journal");
    assert.equal(calls[0].method, "POST");

    const body = JSON.parse(calls[0].body) as Record<string, unknown>;

    assert.equal(body.cardId, IDENTITY.cardId, "the id that makes this an update");
    assert.equal(body.sessionId, IDENTITY.sessionId);
    assert.equal(body.view, "front");
    assert.deepEqual(body.card, edited);
  });

  it("never reports a save it did not get", async () => {
    const replies = [
      { status: 401, body: "" },
      { status: 500, body: "" },
      { status: 400, body: "" },
      { status: 200, body: "not json" },
      { status: 200, body: JSON.stringify({ ok: true }) },
      { status: 200, body: JSON.stringify({ ok: true, id: "some-other-card", sessionId: IDENTITY.sessionId }) },
    ];

    for (const reply of replies) {
      const { fetchImpl } = recordingFetch([reply]);
      const outcome = await saveEditedCard(IDENTITY, CARD, "front", fetchImpl);

      assert.equal(outcome.ok, false, JSON.stringify(reply));
    }
  });

  it("treats a create as a failure, because a create would be a duplicate", async () => {
    // 201 is what the route answers when it inserts. If an edit ever inserted, the person would have two
    // cards for one check-in - the defect `ISS-24` fixed - so it is reported as a failed save instead.
    const { fetchImpl } = recordingFetch([
      { status: 201, body: JSON.stringify({ ok: true, id: IDENTITY.cardId, sessionId: IDENTITY.sessionId }) },
    ]);

    const outcome = await saveEditedCard(IDENTITY, CARD, "front", fetchImpl);

    assert.equal(outcome.ok, false);
    assert.ok(outcome.ok === false && outcome.detail.includes("created"));
  });

  it("reports an unreachable service as a failure", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    assert.equal((await saveEditedCard(IDENTITY, CARD, "front", fetchImpl)).ok, false);
  });

  it("a second edit is a second update of the same card, never a new record", async () => {
    const { calls, fetchImpl } = recordingFetch([CONFIRMED, CONFIRMED]);

    await saveEditedCard(IDENTITY, cardWithEdits(CARD, { sentence: "first", region: "shoulder" }), "front", fetchImpl);
    await saveEditedCard(IDENTITY, cardWithEdits(CARD, { sentence: "second", region: "head" }), "back", fetchImpl);

    assert.equal(calls.length, 2);

    for (const call of calls) {
      const body = JSON.parse(call.body) as { cardId: string };

      assert.equal(body.cardId, IDENTITY.cardId, "every edit addresses the card that already exists");
    }
  });
});
