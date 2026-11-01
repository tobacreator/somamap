import type { RowCounts, RowDeletion } from "./deleteEverything.ts";

/**
 * The application-row half of delete-everything - one call, one transaction.
 *
 * It calls `public.delete_my_app_data()` with the **user's own token**. That function is
 * `security invoker`, so row-level security is still in force inside it and it can only
 * reach the caller's own rows. No service key is used, and none is accepted here.
 *
 * The function answers with what REMAINS per table, so this module never has to trust a
 * "deleted" claim: zero everywhere is the only success.
 */

export type RowDeleterConfig = {
  baseUrl: string;
  /** The publishable key: public by design, still never logged. */
  anonKey: string;
  /** The signed-in user's access token. Never logged. */
  accessToken: string;
};

export function appRowsDeleter(config: RowDeleterConfig, fetchImpl: typeof fetch = fetch): () => Promise<RowDeletion> {
  return async (): Promise<RowDeletion> => {
    try {
      const response = await fetchImpl(`${config.baseUrl}/rest/v1/rpc/delete_my_app_data`, {
        method: "POST",
        headers: {
          apikey: config.anonKey,
          authorization: `Bearer ${config.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (response.status !== 200 && response.status !== 204) {
        return { ok: false, remaining: null, detail: `status ${response.status}` };
      }

      const value = JSON.parse(await response.text()) as unknown;
      const row = Array.isArray(value) ? value[0] : value;

      if (row === null || typeof row !== "object") {
        return { ok: false, remaining: null, detail: "the answer was not a row" };
      }

      const counts = row as Record<string, unknown>;
      const remaining: RowCounts = {
        sessionsRemaining: countOf(counts.sessions_remaining),
        cardsRemaining: countOf(counts.cards_remaining),
        journalEntriesRemaining: countOf(counts.journal_entries_remaining),
        profilesRemaining: countOf(counts.profiles_remaining),
      };

      if (Object.values(remaining).some((count) => count < 0)) {
        return { ok: false, remaining: null, detail: "the answer was missing a count" };
      }

      return { ok: true, remaining, detail: "row deletion completed" };
    } catch (error) {
      return { ok: false, remaining: null, detail: `the row request failed (${errorName(error)})` };
    }
  };
}

/** The count, or -1 when the answer did not carry one. */
function countOf(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : -1;
}

/** The error's name only: never its message, which can echo request details. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}
