import { redTeamRows } from "./rows.ts";
import type { RedTeamRow, RedTeamRowId } from "./types.ts";

/**
 * SomaMap red-team pack runner - blueprint Section 3.4, Table 7.
 *
 * Prints one line per row as PASS, PARTIAL, FAIL or NOT IMPLEMENTED, then exits
 * non-zero unless all eight rows PASS, because gate G2.1 requires all eight rows to
 * print PASS. PARTIAL and NOT IMPLEMENTED both keep the gate red: a row that cannot
 * prove its Table 7 behaviour is never counted as a pass, and nothing here is faked
 * to make a row look green.
 *
 * The pack runs entirely locally: no model, no provider, no database, no network.
 */

/** Table 7 is a pack of eight. A missing row is a failure of the pack itself. */
const EXPECTED_IDS: RedTeamRowId[] = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];

const ID_WIDTH = 4;
const TITLE_WIDTH = 20;
const STATUS_WIDTH = 16;

type RowStatus = "PASS" | "PARTIAL" | "FAIL" | "NOT IMPLEMENTED";

type RowReport = {
  status: RowStatus;
  detail: string;
  unverified: string[];
};

function runRow(row: RedTeamRow): RowReport {
  if (!row.run) {
    return {
      status: "NOT IMPLEMENTED",
      detail: `blocked on: ${(row.blockedOn ?? ["no reason recorded"]).join("; ")}`,
      unverified: [],
    };
  }

  try {
    const outcome = row.run();
    const unverified = outcome.unverified ?? [];

    // A check may not claim PASS while it is still declaring required clauses
    // unverified, so the runner downgrades it. The gate cannot go green on a partial
    // proof, whatever a check module returns.
    if (outcome.status === "PASS" && unverified.length > 0) {
      return {
        status: "PARTIAL",
        detail: `${outcome.detail} (downgraded from PASS: required clauses remain unverified)`,
        unverified,
      };
    }

    return { status: outcome.status, detail: outcome.detail, unverified };
  } catch (error) {
    return {
      status: "FAIL",
      detail: `threw: ${error instanceof Error ? error.message : String(error)}`,
      unverified: [],
    };
  }
}

function printRow(row: RedTeamRow, report: RowReport): void {
  const prefix = `${row.id.padEnd(ID_WIDTH)}${row.title.padEnd(TITLE_WIDTH)}${report.status.padEnd(STATUS_WIDTH)}`;
  console.log(`${prefix}${report.detail}`);

  for (const note of report.unverified) {
    console.log(`${" ".repeat(ID_WIDTH + TITLE_WIDTH + STATUS_WIDTH)}unverified: ${note}`);
  }
}

function main(): void {
  console.log("SomaMap red-team pack - blueprint Section 3.4 (Table 7)");
  console.log("");

  const missingIds = EXPECTED_IDS.filter((id) => !redTeamRows.some((row) => row.id === id));

  if (missingIds.length > 0 || redTeamRows.length !== EXPECTED_IDS.length) {
    console.log(`FAIL  the pack does not carry all eight Table 7 rows (missing: ${missingIds.join(", ") || "none"})`);
    console.log("");
    console.log("Gate G2.1 is NOT GREEN.");
    process.exitCode = 1;
    return;
  }

  let passed = 0;
  let partial = 0;
  let failed = 0;
  let pending = 0;

  for (const row of redTeamRows) {
    const report = runRow(row);
    printRow(row, report);

    if (report.status === "PASS") {
      passed += 1;
    } else if (report.status === "PARTIAL") {
      partial += 1;
    } else if (report.status === "FAIL") {
      failed += 1;
    } else {
      pending += 1;
    }
  }

  console.log("");
  console.log(`PASS ${passed} - PARTIAL ${partial} - FAIL ${failed} - NOT IMPLEMENTED ${pending}`);
  console.log("");

  if (partial > 0 || failed > 0 || pending > 0) {
    console.log(
      `Gate G2.1 requires all eight rows to print PASS. ${pending} row(s) are not implemented, ${partial} row(s) are only partly verified and ${failed} row(s) failed.`,
    );
    console.log("Gate G2 is NOT GREEN. No interview, card, or journal generation code may be written yet.");
    process.exitCode = 1;
    return;
  }

  console.log("All eight rows PASS, so this pack satisfies gate G2.1. The other G2 criteria are tracked separately.");
}

main();
