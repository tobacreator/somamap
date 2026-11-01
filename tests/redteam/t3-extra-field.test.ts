import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { APPROVED_CONTENT_COLUMNS, contentColumnsFromMigration } from "./t3-extra-field.ts";

/**
 * Mutation tests for the T3 cards-table check.
 *
 * T3's third clause is that the cards table can only store the five approved fields, so
 * the check reads the table definition in the migration. These tests show it fails when
 * that definition gains a content column (the hostile case) or loses one.
 */

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATION_SQL = readFileSync(join(PROJECT_ROOT, "supabase", "migrations", "001_init.sql"), "utf8");

describe("T3 cards-table check", () => {
  it("reads exactly the five content columns from the migration", () => {
    const result = contentColumnsFromMigration(MIGRATION_SQL);

    assert.equal(result.ok, true);
    assert.deepEqual([...result.columns].sort(), [...APPROVED_CONTENT_COLUMNS].sort());
  });

  it("ignores the bookkeeping columns and the table's constraints", () => {
    const result = contentColumnsFromMigration(MIGRATION_SQL);

    for (const column of ["id", "session_id", "created_at", "updated_at"]) {
      assert.equal(result.columns.includes(column), false, column);
    }
  });

  it("reports a content column that should not be there", () => {
    const withExtra = MIGRATION_SQL.replace(
      "  user_own_sentence  text not null,",
      "  user_own_sentence  text not null,\n  possible_cause      text,",
    );

    assert.notEqual(withExtra, MIGRATION_SQL, "the fixture must actually change the migration");

    const result = contentColumnsFromMigration(withExtra);

    assert.equal(result.ok, true);
    assert.ok(result.columns.includes("possible_cause"));
    assert.notDeepEqual([...result.columns].sort(), [...APPROVED_CONTENT_COLUMNS].sort());
  });

  it("reports a missing content column", () => {
    const withMissing = MIGRATION_SQL.replace(/^\s*duration\s+text not null,\r?\n/m, "");

    assert.notEqual(withMissing, MIGRATION_SQL, "the fixture must actually change the migration");

    const result = contentColumnsFromMigration(withMissing);

    assert.equal(result.ok, true);
    assert.equal(result.columns.includes("duration"), false);
  });

  it("fails closed when the table definition is absent", () => {
    const result = contentColumnsFromMigration("-- no cards table here");

    assert.equal(result.ok, false);
    assert.deepEqual(result.columns, []);
  });
});
