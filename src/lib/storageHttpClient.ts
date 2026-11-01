import { LIST_PAGE_SIZE, type StorageClient, type StorageDeleteResult, type StorageListPage } from "./storageObjects.ts";

/**
 * The HTTP side of the storage calls - blueprint Chapter 6.1 and T8.
 *
 * Requests are made as the signed-in user: the publishable key travels as `apikey` and the
 * user's access token as `authorization`, exactly as a browser client would send them. No
 * service key is involved anywhere in this file, so the storage policies in 001_init.sql
 * decide what may be touched.
 *
 * Nothing here logs, returns or embeds a key, a token, a header or a response body: a
 * failure is reported as a status number or an error name, which is all a caller needs.
 */

export type StorageHttpConfig = {
  /** The project URL from the server environment. Never printed. */
  baseUrl: string;
  bucket: string;
  /** The publishable key. Public by design, but still never logged. */
  anonKey: string;
  /** The signed-in user's access token. Never logged and never returned to a client. */
  accessToken: string;
};

/** A `fetch`-shaped storage client. `fetchImpl` is injectable so tests need no network. */
export function httpStorageClient(config: StorageHttpConfig, fetchImpl: typeof fetch = fetch): StorageClient {
  const headers: Record<string, string> = {
    apikey: config.anonKey,
    authorization: `Bearer ${config.accessToken}`,
    "content-type": "application/json",
  };

  return {
    async list(prefix: string, offset: number): Promise<StorageListPage> {
      try {
        const response = await fetchImpl(`${config.baseUrl}/storage/v1/object/list/${config.bucket}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ prefix, limit: LIST_PAGE_SIZE, offset }),
        });
        const text = await response.text();

        if (response.status !== 200) return { ok: false, entries: [], detail: `status ${response.status}` };

        const value = JSON.parse(text) as unknown;

        if (!Array.isArray(value)) return { ok: false, entries: [], detail: "the listing was not an array" };

        const entries: { name: string; isFolder: boolean }[] = [];

        for (const item of value) {
          if (item === null || typeof item !== "object") {
            return { ok: false, entries: [], detail: "a listing entry was not an object" };
          }

          const { name, id } = item as { name?: unknown; id?: unknown };

          if (typeof name !== "string" || name.length === 0) {
            return { ok: false, entries: [], detail: "a listing entry had no name" };
          }

          entries.push({ name, isFolder: !(typeof id === "string" && id.length > 0) });
        }

        return { ok: true, entries, detail: `entries=${entries.length}` };
      } catch (error) {
        return { ok: false, entries: [], detail: `the listing request failed (${errorName(error)})` };
      }
    },

    async remove(names: readonly string[]): Promise<StorageDeleteResult> {
      try {
        const response = await fetchImpl(`${config.baseUrl}/storage/v1/object/${config.bucket}`, {
          method: "DELETE",
          headers,
          body: JSON.stringify({ prefixes: names }),
        });
        const text = await response.text();

        if (response.status !== 200) return { ok: false, deleted: [], detail: `status ${response.status}` };

        const value = JSON.parse(text) as unknown;

        if (!Array.isArray(value)) return { ok: false, deleted: [], detail: "the delete answer was not an array" };

        const deleted: string[] = [];

        for (const item of value) {
          if (typeof item === "string") {
            deleted.push(item);
            continue;
          }

          const name = item !== null && typeof item === "object" ? (item as { name?: unknown }).name : null;

          if (typeof name !== "string" || name.length === 0) {
            return { ok: false, deleted: [], detail: "the delete answer carried an entry that is not a name" };
          }

          deleted.push(name);
        }

        return { ok: true, deleted, detail: `reported=${deleted.length}` };
      } catch (error) {
        return { ok: false, deleted: [], detail: `the delete request failed (${errorName(error)})` };
      }
    },
  };
}

/** The error's name only: never its message, which can echo request details. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}
