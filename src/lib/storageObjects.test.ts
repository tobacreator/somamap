import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LIST_PAGE_SIZE,
  clearPrefix,
  deleteExactNames,
  enumerateUnderPrefix,
  isConfined,
  type StorageClient,
} from "./storageObjects.ts";

/**
 * The storage walk's tests - blueprint T8 and the Entry 10 lesson.
 *
 * A stub client stands in for the service, so these run with no network. The important
 * cases are the ones that once went wrong for real: a `200 []` that deleted nothing, a
 * listing that fails half way, and an entry that tries to escape the prefix.
 */

type Behaviour = {
  /** The delete answers 200 with an empty array - the silent no-op Entry 10 found. */
  deleteReturnsEmpty?: boolean;
  /** The listing fails from this call number on (1-based). */
  failListAfter?: number;
  /** The delete reports fewer names than it was given. */
  deleteReportsHalf?: boolean;
  /** The listing hands back an entry that escapes the prefix. */
  escapeEntry?: boolean;
};

function fakeClient(objects: string[], behaviour: Behaviour = {}): { client: StorageClient; objects: string[] } {
  let listCalls = 0;
  const live = [...objects];

  const client: StorageClient = {
    async list(prefix: string) {
      listCalls += 1;

      if (behaviour.failListAfter !== undefined && listCalls >= behaviour.failListAfter) {
        return { ok: false, entries: [], detail: "stub listing failure" };
      }

      if (behaviour.escapeEntry) {
        return { ok: true, entries: [{ name: "../escape.txt", isFolder: false }], detail: "escaped" };
      }

      const entries = new Map<string, boolean>();

      for (const name of live) {
        if (!name.startsWith(prefix)) continue;

        const rest = name.slice(prefix.length);
        const slash = rest.indexOf("/");

        if (slash === -1) entries.set(rest, false);
        else entries.set(rest.slice(0, slash), true);
      }

      const page = [...entries.entries()].map(([name, isFolder]) => ({ name, isFolder })).slice(0, LIST_PAGE_SIZE);

      return { ok: true, entries: page, detail: `entries=${page.length}` };
    },

    async remove(names: readonly string[]) {
      if (behaviour.deleteReturnsEmpty) return { ok: true, deleted: [], detail: "reported=0" };

      const reported = behaviour.deleteReportsHalf ? names.slice(0, Math.max(0, names.length - 1)) : [...names];

      for (const name of reported) {
        const at = live.indexOf(name);

        if (at >= 0) live.splice(at, 1);
      }

      return { ok: true, deleted: reported, detail: `reported=${reported.length}` };
    },
  };

  return { client, objects: live };
}

const A = "aaaa-1111/";
const B = "bbbb-2222/";

describe("confinement", () => {
  it("accepts a name inside the prefix and rejects everything else", () => {
    assert.equal(isConfined(`${A}s1/photo.jpg`, A), true);
    assert.equal(isConfined(A, A), false);
    assert.equal(isConfined(`${B}s1/photo.jpg`, A), false);
    assert.equal(isConfined(`${A}../escape.txt`, A), false);
    assert.equal(isConfined(`${A}s1//photo.jpg`, A), false);
    assert.equal(isConfined("/absolute.txt", A), false);
  });
});

describe("enumerateUnderPrefix", () => {
  it("walks into folder placeholders and returns every object, including nested ones", async () => {
    const { client } = fakeClient([`${A}s1/photo.jpg`, `${A}s2/deeper/photo.png`, `${B}s1/other.jpg`]);

    const found = await enumerateUnderPrefix(client, A);

    assert.equal(found.ok, true);
    assert.deepEqual([...found.names].sort(), [`${A}s1/photo.jpg`, `${A}s2/deeper/photo.png`]);
  });

  it("reports an empty prefix as empty, not as a failure", async () => {
    const { client } = fakeClient([`${B}s1/other.jpg`]);

    const found = await enumerateUnderPrefix(client, A);

    assert.equal(found.ok, true);
    assert.deepEqual(found.names, []);
  });

  it("fails closed when the listing fails", async () => {
    const { client } = fakeClient([`${A}s1/photo.jpg`], { failListAfter: 1 });

    const found = await enumerateUnderPrefix(client, A);

    assert.equal(found.ok, false);
    assert.deepEqual(found.names, []);
  });

  it("fails closed when an entry escapes the prefix", async () => {
    const { client } = fakeClient([`${A}s1/photo.jpg`], { escapeEntry: true });

    const found = await enumerateUnderPrefix(client, A);

    assert.equal(found.ok, false);
  });
});

describe("deleteExactNames", () => {
  it("accepts a service that reports exactly the names it was given", async () => {
    const { client, objects } = fakeClient([`${A}s1/photo.jpg`]);

    const result = await deleteExactNames(client, [`${A}s1/photo.jpg`]);

    assert.equal(result.ok, true);
    assert.deepEqual(objects, []);
  });

  it("refuses to accept the silent no-op: 200 with nothing reported", async () => {
    const { client, objects } = fakeClient([`${A}s1/photo.jpg`], { deleteReturnsEmpty: true });

    const result = await deleteExactNames(client, [`${A}s1/photo.jpg`]);

    assert.equal(result.ok, false);
    assert.deepEqual(objects, [`${A}s1/photo.jpg`], "the object is still there, so this must not count as deleted");
  });

  it("refuses a short report", async () => {
    const { client } = fakeClient([`${A}s1/photo.jpg`, `${A}s1/two.jpg`], { deleteReportsHalf: true });

    const result = await deleteExactNames(client, [`${A}s1/photo.jpg`, `${A}s1/two.jpg`]);

    assert.equal(result.ok, false);
  });
});

describe("clearPrefix", () => {
  it("clears the prefix and proves it empty", async () => {
    const { client, objects } = fakeClient([`${A}s1/photo.jpg`, `${A}s2/deeper/photo.png`]);

    const cleared = await clearPrefix(client, A);

    assert.equal(cleared.ok, true);
    assert.equal(cleared.enumerated, 2);
    assert.equal(cleared.deleted, 2);
    assert.equal(cleared.remaining, 0);
    assert.deepEqual(objects, []);
  });

  it("is safe on an already-empty prefix", async () => {
    const { client } = fakeClient([`${B}s1/other.jpg`]);

    const cleared = await clearPrefix(client, A);

    assert.equal(cleared.ok, true);
    assert.equal(cleared.deleted, 0);
    assert.equal(cleared.remaining, 0);
  });

  it("does not claim success when the delete was a no-op", async () => {
    const { client, objects } = fakeClient([`${A}s1/photo.jpg`], { deleteReturnsEmpty: true });

    const cleared = await clearPrefix(client, A);

    assert.equal(cleared.ok, false);
    assert.equal(cleared.remaining, -1);
    assert.deepEqual(objects, [`${A}s1/photo.jpg`]);
  });

  it("does not claim success when the verifying walk fails", async () => {
    const { client } = fakeClient([`${A}s1/photo.jpg`], { failListAfter: 2 });

    const cleared = await clearPrefix(client, A);

    assert.equal(cleared.ok, false);
    assert.equal(cleared.remaining, -1);
  });

  it("never touches another account's objects", async () => {
    const { client, objects } = fakeClient([`${A}s1/photo.jpg`, `${B}s1/other.jpg`]);

    const cleared = await clearPrefix(client, A);

    assert.equal(cleared.ok, true);
    assert.deepEqual(objects, [`${B}s1/other.jpg`]);
  });
});

