import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The token-discipline check - Phase B's objective guard (BUILD-REPORT.md Entry 39, objective 1).
 *
 * Before Phase B the same idea had many shapes: colours were written out as raw palette classes at
 * every site, `dark:` variants duplicated each of them, the page wrapper was copied into three
 * routes, and the fixed line was rendered in five files. This check reads the application source
 * and fails if any of that comes back, in the same fail-closed spirit as the red team's copy scan.
 *
 * It is a scan, not a compiler: it cannot prove a screen looks right. It can prove that the token
 * layer is the only place colours are named, that the shell owns the page measure, and that the
 * fixed line has one home.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Application source: the components and the routes. */
const SCAN_ROOTS = ["src/components", "src/app"] as const;

/**
 * Deliberate exclusions, each with its reason:
 *
 *   - `src/app/globals.css` is where the tokens are declared, so it is the one file that names
 *     colours - and it is not a `.ts`/`.tsx` file, so the extension filter below already skips it.
 *
 * `src/app/page.tsx` used to be excluded here, because it was still the create-next-app scaffold. It is
 * the real landing page now, so it is scanned like every other screen - which is why it names tokens and
 * no palette colours, and renders through the shell.
 */
const EXCLUDED = new Set(["src/app/globals.css"]);

/** A Tailwind utility that names a palette colour, e.g. `text-zinc-900`, `dark:bg-red-700`. */
const PALETTE_UTILITY =
  /\b(?:bg|text|border|fill|stroke|outline|ring|decoration|divide|placeholder|from|to|via)-(?:zinc|sky|red|emerald|amber|green|blue|indigo|violet|purple|pink|rose|orange|yellow|lime|teal|cyan|fuchsia|slate|gray|neutral|stone)-\d{2,3}\b/;

/** A colour switched by hand for dark mode. The tokens switch themselves. */
const DARK_COLOUR_VARIANT = /\bdark:(?:bg|text|border|fill|stroke|outline|ring|placeholder)-/;

const DISCLAIMER_RENDERED = "{DISCLAIMER_LINE}";
const COLUMN_MEASURE = "max-w-[var(--width-column)]";

function toRepoPath(absolute: string): string {
  return relative(ROOT, absolute).replaceAll("\\", "/");
}

function listSourceFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...listSourceFiles(absolute));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      found.push(absolute);
    }
  }

  return found;
}

type SourceFile = { file: string; text: string; lines: readonly string[] };

const sources: SourceFile[] = SCAN_ROOTS.flatMap((root) => listSourceFiles(join(ROOT, root)))
  .map(toRepoPath)
  .filter((file) => !EXCLUDED.has(file))
  .map((file) => {
    const text = readFileSync(join(ROOT, file), "utf8");

    return { file, text, lines: text.split(/\r?\n/) };
  });

/** The lines of a file that match a pattern, as `file:line`, for a readable failure message. */
function hits(pattern: RegExp): string[] {
  return sources.flatMap(({ file, lines }) =>
    lines.flatMap((line, index) => (pattern.test(line) ? [`${file}:${index + 1} ${line.trim()}`] : [])),
  );
}

describe("token discipline", () => {
  it("scans a non-empty set of application files", () => {
    // A scan that finds nothing to scan must not read as a clean result.
    assert.ok(sources.length > 10, `expected the application source to be scanned, found ${sources.length} files`);
  });

  it("names no raw palette colour outside the token definitions", () => {
    assert.deepEqual(hits(PALETTE_UTILITY), [], "these lines use a palette colour instead of a token");
  });

  it("switches no colour by hand for dark mode", () => {
    assert.deepEqual(hits(DARK_COLOUR_VARIANT), [], "these lines use a dark: colour variant; the tokens switch themselves");
  });

  it("keeps the old page wrapper out of the routes", () => {
    assert.deepEqual(hits(/max-w-\[390px\]/), [], "the page measure belongs to the Screen shell alone");
  });

  it("sets the page measure in the shell, and only there", () => {
    const withMeasure = sources.filter(({ text }) => text.includes(COLUMN_MEASURE)).map(({ file }) => file);

    assert.deepEqual(withMeasure, ["src/components/Screen.tsx"]);
  });

  it("renders the fixed line from exactly one component", () => {
    const rendering = sources.filter(({ text }) => text.includes(DISCLAIMER_RENDERED)).map(({ file }) => file);

    assert.deepEqual(rendering, ["src/components/DisclaimerFooter.tsx"]);
  });

  it("renders every route through the shell", () => {
    for (const route of [
      "src/app/page.tsx",
      "src/app/checkin/page.tsx",
      "src/app/settings/page.tsx",
      "src/app/sign-in/page.tsx",
      "src/app/sign-up/page.tsx",
      "src/app/journal/page.tsx",
      "src/app/journal/[id]/page.tsx",
    ]) {
      const source = sources.find(({ file }) => file === route);

      assert.ok(source !== undefined, `${route} must be scanned`);
      assert.ok(source.text.includes("<Screen"), `${route} must render the Screen shell`);
    }
  });
});
