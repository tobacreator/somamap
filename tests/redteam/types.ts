/**
 * Shared shapes for the SomaMap red-team pack (blueprint Section 3.4, Table 7).
 *
 * A row is either runnable today (`run`) or explicitly blocked on modules that do
 * not exist yet (`blockedOn`). There is no third option, and a row that cannot be
 * run is never reported as PASS.
 */

export type RedTeamRowId = "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7" | "T8";

/** What a runnable row reports back to the runner. */
export type RedTeamOutcome = {
  /**
   * PASS means every clause of the row's Table 7 behaviour was verified.
   * PARTIAL means some clauses were verified and others cannot be yet: the row is
   * printed as PARTIAL and keeps the gate red.
   * FAIL means a clause was verified and violated.
   */
  status: "PASS" | "PARTIAL" | "FAIL";
  /** One line of evidence, printed next to the row. */
  detail: string;
  /**
   * Required Table 7 clauses this run could not verify yet. A row that reports any
   * of these is printed as PARTIAL, never as PASS: the runner downgrades a PASS that
   * still carries unverified clauses.
   */
  unverified?: string[];
};

export type RedTeamRow = {
  id: RedTeamRowId;
  /** Short row name, as printed in Table 7. */
  title: string;
  /** The required behaviour, from Table 7. */
  required: string;
  /** Present only when the row can run against the code that exists today. */
  run?: () => RedTeamOutcome;
  /** Present only when the row cannot run yet: what it is blocked on. */
  blockedOn?: string[];
};
