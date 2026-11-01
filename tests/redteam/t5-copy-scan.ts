import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RedTeamOutcome } from "./types.ts";

/** Repository root, resolved from this file so the scan does not depend on the caller's cwd. */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Stems rather than whole words, so 'diagnos' catches diagnosis and diagnostic
 * exactly as the prescribed `grep -ri 'symptom\|diagnos\|treatment'` does.
 * 'indicat' is scanned as well because iron rule 5 forbids "indicates"; it also
 * catches indicate, indicated, indicating and indication.
 */
const PROHIBITED_STEMS = ["symptom", "diagnos", "treatment", "indicat"] as const;

/**
 * Rule 5's fixed line, verbatim. It is the one place the word 'advice' may appear.
 *
 * WHEN src/lib/copy.ts EXISTS: import its disclaimer constant here and delete this
 * literal. The pack must never keep a second copy of production copy, and a drifted
 * literal would stop matching (the check fails closed, but for the wrong reason).
 * Until then this literal is the only reference available, because no production copy
 * module exists yet.
 */
const DISCLAIMER_LINE =
  "SomaMap is a vocabulary and journaling tool. It does not interpret sensations or give medical advice.";

/**
 * Scan scope: application source only.
 *
 * Scanned: the two roots Table 7 prescribes, plus src/lib, which the blueprint
 * designates as the home of UI copy (src/lib/copy.ts) and of the disclaimer line this
 * check exempts.
 *
 * Deliberately out of scope, and why:
 *   - .clinerules and BUILD-REPORT.md: documents. Rule 5's own text contains the words
 *     this check greps for, and the report quotes it.
 *   - the blueprint PDFs: reference documents, not application source.
 *   - tests/: this pack has to contain the very terms it greps for, and it holds the
 *     disclaimer literal.
 *   - .next, node_modules and other generated trees: not source.
 */
const PRESCRIBED_SCAN_ROOTS = ["src/app", "src/components"] as const; // blueprint Table 7
const ADDITIONAL_SCAN_ROOTS = ["src/lib"] as const; // this pack's addition

const ALL_SCAN_ROOTS = [...PRESCRIBED_SCAN_ROOTS, ...ADDITIONAL_SCAN_ROOTS];

type TextFile = { file: string; text: string };
type CopyHit = { file: string; line: number; reason: string };

function toRepoPath(absolute: string): string {
  return relative(PROJECT_ROOT, absolute).replaceAll("\\", "/");
}

/** Every file under a root, whatever its extension. Directories are descended into, never skipped. */
function listFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...listFiles(absolute));
    } else if (entry.isFile()) {
      found.push(absolute);
    }
  }

  return found;
}

/**
 * Text versus binary: a file is treated as text unless its bytes contain a NUL, the
 * usual heuristic. No extension allowlist is involved, so a file cannot be skipped
 * merely for having an unfamiliar extension, and nothing is skipped silently: every
 * skipped file is named in the row's output.
 */
function readAsText(absolute: string): string | null {
  const bytes = readFileSync(absolute);

  return bytes.includes(0) ? null : bytes.toString("utf8");
}

/**
 * Drops quotes, backticks, concatenation marks and runs of whitespace, so the
 * disclaimer still matches when it sits inside a wrapped string constant.
 * Limitation: a disclaimer split across several source lines is not recognised, which
 * makes the check stricter, never looser.
 */
function normaliseForDisclaimerMatch(line: string): string {
  return line.replace(/["'`+;,\\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The exemption is granted only when the disclaimer is the line's *only* mention of
 * the exempted word: the disclaimer is cut out of the normalised line and the
 * remainder is re-tested, so a line cannot hide extra wording behind the disclaimer.
 */
function isExemptDisclaimerLine(line: string): boolean {
  const normalised = normaliseForDisclaimerMatch(line);
  const at = normalised.indexOf(DISCLAIMER_LINE);

  if (at === -1) {
    return false;
  }

  const remainder = `${normalised.slice(0, at)}${normalised.slice(at + DISCLAIMER_LINE.length)}`;

  return !remainder.toLowerCase().includes("advice");
}

function scanTextFile(entry: TextFile): CopyHit[] {
  const hits: CopyHit[] = [];

  entry.text.split(/\r?\n/).forEach((line, index) => {
    const lower = line.toLowerCase();
    const stem = PROHIBITED_STEMS.find((candidate) => lower.includes(candidate));

    if (stem) {
      hits.push({ file: entry.file, line: index + 1, reason: `contains "${stem}"` });
      return;
    }

    if (!lower.includes("advice")) {
      return;
    }

    if (isExemptDisclaimerLine(line)) {
      return;
    }

    hits.push({ file: entry.file, line: index + 1, reason: 'contains "advice" outside the fixed disclaimer line' });
  });

  return hits;
}

/**
 * T5 - copy scan (blueprint Table 7).
 *
 * Input: the prescribed case-insensitive scan of src/app and src/components for the
 * prohibited UI words, plus the 'advice' scan with the disclaimer line exempted.
 * Required: zero hits.
 *
 * An incomplete scan is never reported as a clean result. Both a missing required root
 * and a scan with no eligible file fail the row; when a violation and an incomplete
 * root are both present, the violation is reported first because it is the more
 * actionable finding, and the missing root is still named.
 */
export function t5CopyScan(): RedTeamOutcome {
  const missingPrescribed: string[] = [];
  const missingAdditional: string[] = [];
  const files: string[] = [];

  for (const root of PRESCRIBED_SCAN_ROOTS) {
    const absolute = join(PROJECT_ROOT, root);

    if (existsSync(absolute)) {
      files.push(...listFiles(absolute));
    } else {
      missingPrescribed.push(root);
    }
  }

  for (const root of ADDITIONAL_SCAN_ROOTS) {
    const absolute = join(PROJECT_ROOT, root);

    if (existsSync(absolute)) {
      files.push(...listFiles(absolute));
    } else {
      missingAdditional.push(root);
    }
  }

  const missing = [
    ...missingPrescribed.map((root) => `${root} (prescribed by Table 7)`),
    ...missingAdditional.map((root) => `${root} (added by this pack)`),
  ];

  if (files.length === 0) {
    return {
      status: "FAIL",
      detail:
        missing.length > 0
          ? `scan incomplete: required scan root missing -> ${missing.join(", ")} and no file was found under the roots that do exist`
          : `scan incomplete: zero files found under ${ALL_SCAN_ROOTS.join(", ")}`,
    };
  }

  const textFiles: TextFile[] = [];
  const skippedFiles: string[] = [];

  for (const absolute of files) {
    const text = readAsText(absolute);

    if (text === null) {
      skippedFiles.push(toRepoPath(absolute));
    } else {
      textFiles.push({ file: toRepoPath(absolute), text });
    }
  }

  if (textFiles.length === 0) {
    return {
      status: "FAIL",
      detail: `scan incomplete: all ${files.length} file(s) under ${ALL_SCAN_ROOTS.join(", ")} were treated as binary`,
    };
  }

  const hits = textFiles.flatMap((entry) => scanTextFile(entry));
  const incompleteNote =
    missing.length > 0 ? `; scan incomplete: required scan root missing -> ${missing.join(", ")}` : "";

  if (hits.length > 0) {
    return {
      status: "FAIL",
      detail: `${hits.length} prohibited hit(s): ${hits
        .map((hit) => `${hit.file}:${hit.line} ${hit.reason}`)
        .join("; ")}${incompleteNote}`,
    };
  }

  if (missing.length > 0) {
    return {
      status: "FAIL",
      detail: `scan incomplete, which is not a clean result: required scan root missing -> ${missing.join(", ")}; ${textFiles.length} text file(s) were scanned and produced zero prohibited hits`,
    };
  }

  const shown = skippedFiles.slice(0, 5).join(", ");
  const more = skippedFiles.length > 5 ? ` (+${skippedFiles.length - 5} more)` : "";
  const binaryNote =
    skippedFiles.length === 0
      ? "no file was treated as binary"
      : `${skippedFiles.length} file(s) treated as binary (NUL bytes) and not scanned: ${shown}${more}`;

  return {
    status: "PASS",
    detail: `zero prohibited hits across ${textFiles.length} text file(s) under ${ALL_SCAN_ROOTS.join(", ")}; ${binaryNote}`,
  };
}
