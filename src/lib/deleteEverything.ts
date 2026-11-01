import { clearPrefix, type StorageClient } from "./storageObjects.ts";

/**
 * Delete everything - blueprint Chapter 6.1, Table 12 row 8 and T8.
 *
 * Order is the whole design: **storage first, rows second**. If the rows went first and the
 * storage step failed, the objects would be orphaned and unreferenced - exactly the failure
 * T8 exists to catch. This way a storage failure changes nothing, and a row failure leaves
 * only rows pointing at photos that are already gone, which a retry finishes off.
 *
 * The operation is idempotent by construction: the storage step walks the account's own
 * prefix, which depends on nothing but the account id, and the row step reports what
 * REMAINS. Running it twice is safe and the second run deletes nothing.
 *
 * Success means all three of: the prefix re-enumerated to zero objects, every row count came
 * back zero, and the account was confirmed still present. Anything else is reported as a
 * failure with a category - never as success, and never with the user's data in it.
 */

/** What the row half reports: what REMAINS for this user, per table. */
export type RowCounts = {
  sessionsRemaining: number;
  cardsRemaining: number;
  journalEntriesRemaining: number;
  profilesRemaining: number;
};

export type RowDeletion = { ok: boolean; remaining: RowCounts | null; detail: string };

export type DeleteEverythingDeps = {
  /** The signed-in user's storage client. It carries that user's token, nothing else. */
  storage: StorageClient;
  /** The prefix only this account can own: `<userId>/`. */
  prefix: string;
  /** Deletes the user's application rows in one transaction and reports what remains. */
  deleteRows: () => Promise<RowDeletion>;
  /** Confirms the authentication account itself is still there. */
  checkAccount: () => Promise<{ present: boolean; detail: string }>;
};

export type DeleteEverythingResult = {
  ok: boolean;
  storage: {
    enumerated: number;
    deleted: number;
    /** Objects still visible afterwards, or -1 when the verifying walk failed. */
    remaining: number;
    verifiedEmpty: boolean;
    detail: string;
  };
  rows: RowCounts | null;
  rowsRemoved: boolean;
  accountPresent: boolean;
  /** Failure categories, for the caller and the tests. Never user content. */
  failures: readonly string[];
};

export async function deleteEverything(deps: DeleteEverythingDeps): Promise<DeleteEverythingResult> {
  const cleared = await clearPrefix(deps.storage, deps.prefix);

  if (!cleared.ok) {
    return {
      ok: false,
      storage: {
        enumerated: cleared.enumerated,
        deleted: cleared.deleted,
        remaining: cleared.remaining,
        verifiedEmpty: false,
        detail: cleared.detail,
      },
      rows: null,
      rowsRemoved: false,
      accountPresent: true,
      failures: ["storage"],
    };
  }

  const storage = {
    enumerated: cleared.enumerated,
    deleted: cleared.deleted,
    remaining: cleared.remaining,
    verifiedEmpty: true,
    detail: cleared.detail,
  };

  const rows = await deps.deleteRows();

  if (!rows.ok || rows.remaining === null) {
    return { ok: false, storage, rows: null, rowsRemoved: false, accountPresent: true, failures: ["rows"] };
  }

  const rowsRemoved = Object.values(rows.remaining).every((count) => count === 0);
  const account = await deps.checkAccount();

  const failures: string[] = [];

  if (!rowsRemoved) failures.push("rows");
  if (!account.present) failures.push("account");

  return {
    ok: rowsRemoved && account.present,
    storage,
    rows: rows.remaining,
    rowsRemoved,
    accountPresent: account.present,
    failures,
  };
}
