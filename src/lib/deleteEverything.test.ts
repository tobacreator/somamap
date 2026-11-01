import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deleteEverything, type DeleteEverythingDeps, type RowCounts } from "./deleteEverything.ts";
import { clearPrefix, type StorageClient } from "./storageObjects.ts";

/**
 * The orchestrator's tests - blueprint Chapter 6.1 and T8.
 *
 * These pin the properties that make the action safe: storage before rows, no row delete
 * after a storage failure, success only when everything verified, and idempotence.
 */

const A = "aaaa-1111/";

const NONE_REMAIN: RowCounts = {
  sessionsRemaining: 0,
  cardsRemaining: 0,
  journalEntriesRemaining: 0,
  profilesRemaining: 0,
};

function storageWith(objects: string[], noopDelete = false): StorageClient {
  const live = [...objects];

  return {
    async list(prefix: string) {
      const entries = new Map<string, boolean>();

      for (const name of live) {
        if (!name.startsWith(prefix)) continue;

        const rest = name.slice(prefix.length);
        const slash = rest.indexOf("/");

        if (slash === -1) entries.set(rest, false);
        else entries.set(rest.slice(0, slash), true);
      }

      return {
        ok: true,
        entries: [...entries.entries()].map(([name, isFolder]) => ({ name, isFolder })),
        detail: "stub",
      };
    },
    async remove(names: readonly string[]) {
      if (noopDelete) return { ok: true, deleted: [], detail: "reported=0" };

      for (const name of names) {
        const at = live.indexOf(name);

        if (at >= 0) live.splice(at, 1);
      }

      return { ok: true, deleted: [...names], detail: `reported=${names.length}` };
    },
  };
}

function deps(overrides: Partial<DeleteEverythingDeps> = {}): DeleteEverythingDeps & { rowCalls: () => number } {
  let rowCalls = 0;

  const base: DeleteEverythingDeps = {
    storage: storageWith([`${A}s1/photo.jpg`]),
    prefix: A,
    deleteRows: async () => {
      rowCalls += 1;

      return { ok: true, remaining: { ...NONE_REMAIN }, detail: "stub" };
    },
    checkAccount: async () => ({ present: true, detail: "stub" }),
  };

  return { ...base, ...overrides, rowCalls: () => rowCalls };
}

describe("deleteEverything", () => {
  it("clears storage, then rows, and reports success when everything verified", async () => {
    const harness = deps();

    const result = await deleteEverything(harness);

    assert.equal(result.ok, true);
    assert.equal(result.storage.deleted, 1);
    assert.equal(result.storage.verifiedEmpty, true);
    assert.equal(result.rowsRemoved, true);
    assert.equal(result.accountPresent, true);
    assert.deepEqual(result.failures, []);
    assert.equal(harness.rowCalls(), 1);
  });

  it("does not touch rows when the storage step fails", async () => {
    const harness = deps({ storage: storageWith([`${A}s1/photo.jpg`], true) });

    const result = await deleteEverything(harness);

    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, ["storage"]);
    assert.equal(result.rows, null);
    assert.equal(harness.rowCalls(), 0, "a storage failure must leave the rows alone");
  });

  it("reports a failure when rows remain", async () => {
    const harness = deps({
      deleteRows: async () => ({ ok: true, remaining: { ...NONE_REMAIN, cardsRemaining: 2 }, detail: "stub" }),
    });

    const result = await deleteEverything(harness);

    assert.equal(result.ok, false);
    assert.equal(result.rowsRemoved, false);
    assert.deepEqual(result.failures, ["rows"]);
  });

  it("reports a failure when the account is gone", async () => {
    const harness = deps({ checkAccount: async () => ({ present: false, detail: "stub" }) });

    const result = await deleteEverything(harness);

    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, ["account"]);
  });

  it("is idempotent: a second run deletes nothing and still succeeds", async () => {
    const storage = storageWith([`${A}s1/photo.jpg`]);
    const first = await deleteEverything(deps({ storage }));
    const second = await deleteEverything(deps({ storage }));

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.storage.deleted, 0);
    assert.equal(second.storage.remaining, 0);
  });

  it("recovers on a retry after a storage failure", async () => {
    const objects = [`${A}s1/photo.jpg`];
    const broken = await deleteEverything(deps({ storage: storageWith(objects, true) }));
    const recovered = await deleteEverything(deps({ storage: storageWith(objects) }));

    assert.equal(broken.ok, false);
    assert.equal(recovered.ok, true);
    assert.equal(recovered.storage.deleted, 1);
  });

  it("reports categories only, never the user's data", async () => {
    const harness = deps({ storage: storageWith([`${A}s1/photo.jpg`], true) });

    const result = await deleteEverything(harness);
    const serialised = JSON.stringify(result);

    assert.equal(serialised.includes("photo.jpg"), false);
    assert.equal(serialised.includes(A), false);
  });
});

describe("clearPrefix used by the orchestrator", () => {
  it("verifies emptiness independently of what the delete claimed", async () => {
    const cleared = await clearPrefix(storageWith([`${A}s1/photo.jpg`], true), A);

    assert.equal(cleared.ok, false);
    assert.equal(cleared.remaining, -1);
  });
});
