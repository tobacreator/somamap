import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { listJournalCards, type JournalConfig } from "./journalStore.ts";

/**
 * Why the journal can say "could not be loaded" (`ISS-20`).
 *
 * The deployed journal failed with that message while the page answered 200 - which is the whole point:
 * the status of the page says nothing about the database request behind it. The read is a PostgREST call
 * made as the signed-in user, and every way it can fail ends in the same user-facing sentence. These
 * tests pin the two failures that matter, by their status, so neither can be mistaken for an empty
 * journal again:
 *
 *   - **404**: the project has no `public.cards` table - the schema was never applied there;
 *   - **403**: the table exists but the `authenticated` role was never granted the privilege its policies
 *     assume, which is what a project whose default privileges did not apply looks like.
 *
 * The second half of the file is the other half of the fix: the migration must be self-sufficient, so a
 * database built from it cannot produce either error. No network, no database, no secret - the transport
 * is injected and the migration is read as text.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", "001_init.sql"), "utf8");

const CONFIG: JournalConfig = {
  baseUrl: "https://project.example",
  anonKey: "publishable-placeholder",
  accessToken: "user-token-placeholder",
  userId: "3f6c1a58-9a4e-4a4f-8a1f-2b0f9c7d5e11",
};

/** A `fetch` that answers with one status and one body. */
function replying(status: number, body: string): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe("a journal read the database refuses", () => {
  it("reports a missing table (404) as a failure, never as an empty journal", async () => {
    const result = await listJournalCards(
      CONFIG,
      replying(404, '{"code":"42P01","message":"Could not find the table \'public.cards\' in the schema cache"}'),
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.detail : "", "the journal read answered 404");
  });

  it("reports a missing privilege (403) as a failure", async () => {
    const result = await listJournalCards(CONFIG, replying(403, '{"message":"permission denied for table cards"}'));

    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.detail : "", "the journal read answered 403");
  });

  it("names the status and never the database's own message", async () => {
    const providerText = "Could not find the table 'public.cards' in the schema cache";
    const result = await listJournalCards(CONFIG, replying(404, JSON.stringify({ message: providerText })));
    const detail = result.ok === false ? result.detail : "";

    assert.equal(result.ok, false);
    assert.equal(detail.includes(providerText), false);
    assert.equal(detail.includes("public.cards"), false);
    assert.equal(detail.includes("schema cache"), false);
  });

  it("still answers with the user's own card when the database answers", async () => {
    const row = {
      id: "3f6c1a58-9a4e-4a4f-8a1f-2b0f9c7d5e11",
      created_at: "2026-11-04T09:00:00.000Z",
      location_label: "chest",
      quality_words: ["tight"],
      intensity_metaphor: "",
      duration: "",
      user_own_sentence: "It stays in one spot",
    };
    const result = await listJournalCards(CONFIG, replying(200, JSON.stringify([row])));

    assert.equal(result.ok, true);
    assert.equal(result.ok === true ? result.records.length : -1, 1);
    assert.equal(result.ok === true ? result.records[0].location_label : "", "chest");
  });
});

describe("the schema the journal read depends on", () => {
  const TABLES = ["profiles", "sessions", "cards", "journal_entries"] as const;

  it("creates the four application tables", () => {
    for (const table of TABLES) {
      assert.ok(
        MIGRATION.includes(`create table if not exists public.${table}`),
        `the migration must create public.${table}`,
      );
    }
  });

  it("enables row-level security on every one of them, and alters nothing else", () => {
    const altering = MIGRATION.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("alter table public."));

    for (const table of TABLES) {
      assert.ok(
        altering.some((line) => line.startsWith(`alter table public.${table}`) && line.endsWith("enable row level security;")),
        `the migration must enable row-level security on public.${table}`,
      );
    }

    for (const line of altering) {
      assert.ok(line.endsWith("enable row level security;"), line);
    }
  });

  it("grants the authenticated role the privileges its policies assume", () => {
    const grants = MIGRATION.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("grant ") && line.includes(" on public."));

    for (const table of TABLES) {
      assert.ok(
        grants.some((line) => line.includes(`on public.${table} `) && line.endsWith("to authenticated;")),
        `the migration must grant public.${table} to authenticated`,
      );
    }

    for (const line of grants) {
      assert.ok(line.endsWith("to authenticated;"), `every table grant goes to authenticated only: ${line}`);
      assert.ok(line.includes("select, insert, update, delete"), line);
    }
  });

  it("grants nothing at all to the anonymous role", () => {
    assert.equal(/grant[^;]*\bto\s+anon\b/i.test(MIGRATION), false);
    assert.equal(/grant[^;]*\bto\s+public\b/i.test(MIGRATION), false);
  });
});
