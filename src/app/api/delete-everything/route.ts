import { NextResponse } from "next/server";

import { appRowsDeleter } from "@/lib/appRows";
import { accountStillExists, currentSession, supabaseTarget } from "@/lib/authSession";
import { deleteEverything } from "@/lib/deleteEverything";
import { httpStorageClient } from "@/lib/storageHttpClient";
import { targetHost } from "@/lib/supabaseTarget";

/**
 * Delete everything - blueprint Chapter 6.1 and T8.
 *
 * Security shape, in order of importance:
 *   - the caller must have a session that the Auth API has just verified - checked first, so
 *     an unauthenticated request learns nothing about this server's configuration;
 *   - the target must be **validated** (see src/lib/supabaseTarget.ts): an ambiguous or
 *     mismatched environment stops the action here, before any request is made;
 *   - the user id and the storage prefix come from that verified session, never from the
 *     request body (there is no body);
 *   - every storage call and the row call carry the user's own token, so the RLS and
 *     storage policies in 001_init.sql decide what may be touched - no service key is used;
 *   - the response carries counts and categories only: no id, no key, no token, no body
 *     from any upstream service.
 */
export async function POST(): Promise<Response> {
  const session = await currentSession();

  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const resolution = supabaseTarget();

  if (!resolution.ok) {
    return NextResponse.json({ error: "not configured", reason: resolution.reason }, { status: 500 });
  }

  const config = resolution.target;

  // The mode and the host, and nothing else: no key, no token, no cookie, no user content.
  console.warn(`SomaMap delete-everything target: ${config.mode} (${targetHost(config)})`);

  const credentials = { baseUrl: config.baseUrl, anonKey: config.anonKey, accessToken: session.accessToken };

  const result = await deleteEverything({
    storage: httpStorageClient({ ...credentials, bucket: "session-photos" }),
    prefix: `${session.userId}/`,
    deleteRows: appRowsDeleter(credentials),
    checkAccount: async () => ({
      present: await accountStillExists(config, session.accessToken),
      detail: "checked against the auth service",
    }),
  });

  return NextResponse.json(
    {
      ok: result.ok,
      storage: {
        enumerated: result.storage.enumerated,
        deleted: result.storage.deleted,
        remaining: result.storage.remaining,
        verifiedEmpty: result.storage.verifiedEmpty,
      },
      rowsRemoved: result.rowsRemoved,
      accountPresent: result.accountPresent,
      failures: result.failures,
    },
    { status: result.ok ? 200 : 500 },
  );
}

