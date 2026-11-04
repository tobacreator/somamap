import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ANON_JOURNAL_KEY,
  ANON_JOURNAL_LIMIT,
  addAnonCard,
  anonCardFrom,
  clearAnonJournal,
  newAnonCardId,
  readAnonJournal,
  removeAnonCards,
  tabStorage,
  type AnonCard,
  type AnonStorage,
} from "./anonJournal.ts";

/**
 * The in-session journal (`ISS-28`), exercised with a fake storage and no browser.
 *
 * The properties that matter: a finished card survives a reload of the tab; nothing is ever read back that
 * is not a card this build can render; a transfer removes exactly what landed, so a retry cannot write
 * anything twice; and a storage that refuses is reported honestly rather than promised.
 */

/** A storage that behaves like `sessionStorage`, and can be told to refuse. */
function fakeStorage(options: { refuseWrites?: boolean } = {}): AnonStorage & { value: string | null } {
  return {
    value: null,
    getItem() {
      return this.value;
    },
    setItem(_key: string, next: string) {
      if (options.refuseWrites === true) throw new Error("refused");

      this.value = next;
    },
    removeItem() {
      this.value = null;
    },
  };
}

function cardFor(sentence: string, view: "front" | "back" = "front", seed = 0.5): AnonCard {
  return anonCardFrom(
    {
      location_label: "shoulder",
      quality_words: ["tight"],
      intensity_metaphor: "",
      duration: "",
      user_own_sentence: sentence,
    },
    view,
    1_700_000_000_000 + Math.round(seed * 1000),
    () => seed,
  );
}

describe("the in-session journal", () => {
  it("reads as empty when there is nothing stored, or no storage at all", () => {
    assert.deepEqual(readAnonJournal(fakeStorage()), []);
    assert.deepEqual(readAnonJournal(null), []);
  });

  it("keeps a finished card, newest first, with the person's own sentence", () => {
    const storage = fakeStorage();

    addAnonCard(storage, cardFor("first"));
    const cards = addAnonCard(storage, cardFor("second"));

    assert.deepEqual(
      cards.map((card) => card.user_own_sentence),
      ["second", "first"],
    );
    assert.equal(cards[0].location_label, "shoulder");
    assert.deepEqual(cards[0].quality_words, ["tight"]);
    assert.equal(cards[0].view, "front");
  });

  it("survives a reload: what was written is what is read back", () => {
    const storage = fakeStorage();

    addAnonCard(storage, cardFor("a band across my chest"));

    assert.deepEqual(readAnonJournal(storage), readAnonJournal(storage));
    assert.equal(readAnonJournal(storage)[0].user_own_sentence, "a band across my chest");
  });

  it("gives every card its own local id, which is never a database id", () => {
    const first = newAnonCardId(1, () => 0.1);
    const second = newAnonCardId(1, () => 0.9);

    assert.notEqual(first, second);
    assert.ok(first.startsWith("anon-"), first);
    assert.ok(second.startsWith("anon-"), second);
  });

  it("refuses a stored value that is corrupt, another version, or not a list of cards", () => {
    for (const value of [
      "{not json",
      "null",
      "[]",
      '"a string"',
      JSON.stringify({ version: 99, cards: [cardFor("other build")] }),
      JSON.stringify({ version: 1, cards: "not a list" }),
      JSON.stringify({ version: 1, cards: [{ id: "x" }] }),
      JSON.stringify({ version: 1, cards: [{ ...cardFor("no view"), view: "side" }] }),
    ]) {
      const storage = fakeStorage();
      storage.value = value;

      assert.deepEqual(readAnonJournal(storage), [], value);
    }
  });

  it("drops a bad entry and keeps the good ones", () => {
    const storage = fakeStorage();
    const good = cardFor("keep me");

    storage.value = JSON.stringify({ version: 1, cards: [{ id: "broken" }, good] });

    assert.deepEqual(readAnonJournal(storage), [good]);
  });

  it("removes exactly the cards that landed, so a retry cannot write anything twice", () => {
    const storage = fakeStorage();
    const first = cardFor("first", "front", 0.1);
    const second = cardFor("second", "front", 0.9);

    addAnonCard(storage, first);
    addAnonCard(storage, second);

    // The transfer saved the second one and failed on the first: only the saved id is removed.
    const left = removeAnonCards(storage, [second.id]);

    assert.deepEqual(
      left.map((card) => card.user_own_sentence),
      ["first"],
    );
    // A second attempt therefore has exactly one card to send, and it is the one that did not land.
    assert.equal(readAnonJournal(storage).length, 1);
  });

  it("bounds how many cards it keeps", () => {
    const storage = fakeStorage();

    for (let index = 0; index < ANON_JOURNAL_LIMIT + 5; index += 1) addAnonCard(storage, cardFor(`card ${index}`));

    assert.equal(readAnonJournal(storage).length, ANON_JOURNAL_LIMIT);
  });

  it("forgets everything when asked", () => {
    const storage = fakeStorage();

    addAnonCard(storage, cardFor("gone soon"));
    clearAnonJournal(storage);

    assert.deepEqual(readAnonJournal(storage), []);
    assert.equal(storage.value, null);
  });

  it("says so when the browser refuses to store, instead of promising a journal", () => {
    const refusing = fakeStorage({ refuseWrites: true });
    const card = cardFor("only on screen");

    const kept = addAnonCard(refusing, card);

    assert.deepEqual(kept, [], "the caller can see the card was not kept");
    assert.deepEqual(readAnonJournal(refusing), []);
  });

  it("uses one versioned key, so a future format can be told apart", () => {
    const storage = fakeStorage();

    addAnonCard(storage, cardFor("stamped"));

    const stored = JSON.parse(String(storage.value)) as { version?: unknown };
    assert.equal(stored.version, 1);
    assert.ok(ANON_JOURNAL_KEY.includes("v1"), ANON_JOURNAL_KEY);
  });

  it("holds nothing when there is no window, which is the server's case", () => {
    // Node has no `window`, so this is the same path the server render takes.
    assert.equal(tabStorage(), null);
    assert.deepEqual(readAnonJournal(tabStorage()), []);
  });
});
