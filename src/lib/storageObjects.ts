/**
 * Storage objects, one implementation for the app - blueprint Chapter 6.1 and T8.
 *
 * The lesson this file exists to encode, learned the hard way in Entry 10: the bulk-delete
 * endpoint resolves `{"prefixes":[…]}` as EXACT object names, so a folder prefix matches
 * nothing and the service still answers `200 []`. The list endpoint is non-recursive and
 * reports subfolders as placeholders. So clearing a prefix is three steps and no shortcuts:
 * enumerate recursively, delete those exact names, then enumerate again and require zero.
 * A 200 on its own is never proof of anything here.
 *
 * This is an independent implementation, deliberately: `supabase/tests/storage_session_photos.ts`
 * keeps its own copy and is not modified by this task. The two follow the same rules.
 */

/** One listing entry: a real object, or a folder placeholder (no id). */
export type StorageEntry = { name: string; isFolder: boolean };

export type StorageListPage = { ok: boolean; entries: readonly StorageEntry[]; detail: string };

export type StorageDeleteResult = { ok: boolean; deleted: readonly string[]; detail: string };

/** The two calls this module needs, so tests can drive it without a network. */
export type StorageClient = {
  list(prefix: string, offset: number): Promise<StorageListPage>;
  /** Removes exactly these object names. A short or malformed answer is a failure. */
  remove(names: readonly string[]): Promise<StorageDeleteResult>;
};

/** Listing page size and delete batch size, matching the service's own limits. */
export const LIST_PAGE_SIZE = 100;
export const DELETE_BATCH_SIZE = 100;

/** Bounds, so a pathological tree can never turn into an unbounded walk. */
export const MAX_DEPTH = 8;
export const MAX_PAGES_PER_FOLDER = 50;
export const MAX_OBJECTS = 5000;

/** True when `name` is a real object strictly inside `prefix` and cannot escape it. */
export function isConfined(name: string, prefix: string): boolean {
  return (
    prefix.length > 0 &&
    name.startsWith(prefix) &&
    name.length > prefix.length &&
    !name.startsWith("/") &&
    !name.includes("..") &&
    !name.includes("//")
  );
}

export type Enumeration = { ok: boolean; names: string[]; detail: string };

/**
 * Every object name under `prefix`, walking into folder placeholders. Any listing failure,
 * escaped entry or limit breach fails the whole walk: a partial enumeration must never look
 * like a complete one, because the delete step trusts this list.
 */
export async function enumerateUnderPrefix(client: StorageClient, prefix: string): Promise<Enumeration> {
  const names: string[] = [];
  const folders: string[] = [prefix];
  let pages = 0;

  while (folders.length > 0) {
    const folder = folders.shift() as string;

    if (folder.split("/").length - 1 > MAX_DEPTH) {
      return { ok: false, names: [], detail: `depth limit ${MAX_DEPTH} exceeded below ${prefix}` };
    }

    let offset = 0;
    let more = true;

    for (let page = 0; more; page += 1) {
      if (page >= MAX_PAGES_PER_FOLDER) {
        return { ok: false, names: [], detail: `page limit ${MAX_PAGES_PER_FOLDER} reached below ${prefix}` };
      }

      const listing = await client.list(folder, offset);
      pages += 1;

      if (!listing.ok) return { ok: false, names: [], detail: `listing failed below ${prefix}: ${listing.detail}` };

      for (const entry of listing.entries) {
        const full = `${folder}${entry.name}`;

        if (entry.isFolder) {
          const child = `${full}/`;

          if (!isConfined(child, prefix)) {
            return { ok: false, names: [], detail: `a folder escaped ${prefix}` };
          }

          folders.push(child);
          continue;
        }

        if (!isConfined(full, prefix)) return { ok: false, names: [], detail: `an object escaped ${prefix}` };

        names.push(full);

        if (names.length > MAX_OBJECTS) {
          return { ok: false, names: [], detail: `object limit ${MAX_OBJECTS} exceeded below ${prefix}` };
        }
      }

      if (listing.entries.length < LIST_PAGE_SIZE) more = false;
      else offset += LIST_PAGE_SIZE;
    }
  }

  return { ok: true, names, detail: `objects=${names.length} pages=${pages}` };
}

/**
 * Deletes the exact names given, in batches, and requires the service to report back the
 * same names. A `200` that reports nothing, reports fewer names, or answers with a body
 * that is not an array of names is a failure - that is the Entry 10 no-op, caught here.
 */
export async function deleteExactNames(client: StorageClient, names: readonly string[]): Promise<StorageDeleteResult> {
  const deleted: string[] = [];

  for (let index = 0; index < names.length; index += DELETE_BATCH_SIZE) {
    const batch = names.slice(index, index + DELETE_BATCH_SIZE);
    const result = await client.remove(batch);

    if (!result.ok) return { ok: false, deleted, detail: result.detail };

    const missing = batch.filter((name) => !result.deleted.includes(name));

    if (missing.length > 0) {
      return {
        ok: false,
        deleted,
        detail: `the service did not report deleting ${missing.length} of ${batch.length}`,
      };
    }

    const unexpected = result.deleted.filter((name) => !batch.includes(name));

    if (unexpected.length > 0) {
      return {
        ok: false,
        deleted,
        detail: `the service reported names that were not submitted (${unexpected.length})`,
      };
    }

    deleted.push(...result.deleted);
  }

  return {
    ok: true,
    deleted,
    detail: `batches=${Math.ceil(names.length / DELETE_BATCH_SIZE)} deleted=${deleted.length}`,
  };
}

export type PrefixClear = {
  ok: boolean;
  enumerated: number;
  deleted: number;
  /** Objects still visible after the delete, or -1 when the verifying walk failed. */
  remaining: number;
  detail: string;
};

/**
 * Clears everything under `prefix`: enumerate, delete those exact names, then enumerate
 * again and require zero. `ok` is only ever true when the verifying walk found nothing.
 */
export async function clearPrefix(client: StorageClient, prefix: string): Promise<PrefixClear> {
  const before = await enumerateUnderPrefix(client, prefix);

  if (!before.ok) {
    return { ok: false, enumerated: 0, deleted: 0, remaining: -1, detail: `enumeration failed: ${before.detail}` };
  }

  let deleted = 0;

  if (before.names.length > 0) {
    const removal = await deleteExactNames(client, before.names);

    if (!removal.ok) {
      return {
        ok: false,
        enumerated: before.names.length,
        deleted: removal.deleted.length,
        remaining: -1,
        detail: `delete failed: ${removal.detail}`,
      };
    }

    deleted = removal.deleted.length;
  }

  const after = await enumerateUnderPrefix(client, prefix);

  if (!after.ok) {
    return {
      ok: false,
      enumerated: before.names.length,
      deleted,
      remaining: -1,
      detail: `verification walk failed: ${after.detail}`,
    };
  }

  return {
    ok: after.names.length === 0,
    enumerated: before.names.length,
    deleted,
    remaining: after.names.length,
    detail: `enumerated=${before.names.length} deleted=${deleted} remaining=${after.names.length}`,
  };
}

