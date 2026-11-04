import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { readColourTokens, readPalettes } from "./contrast.ts";

/**
 * The palette-scope check - the product's paper, not the visitor's operating system.
 *
 * SomaMap has one palette a person sees and one that exists for the tokens' own resolution. The light
 * palette is what the product is; the dark palette is still declared, still measured by
 * src/lib/designTokens.test.ts, and still what a token resolves to where nothing pins it. What decides
 * which one a screen shows is a single class - `.paper-page`, added by the `PaperPage` wrapper - which
 * `html:has(.paper-page)` in src/app/globals.css turns into the light palette in both colour schemes.
 *
 * The scope is therefore the design decision, and it is exactly the kind of decision that rots quietly: a
 * new route rendering `<Screen>` directly would be dark on a dark-preferring browser, and nobody would
 * notice until a screenshot. This check reads the application source and fails if a route renders without
 * the wrapper, if anything but the wrapper adds the class, if the pin stops covering every colour token
 * (the way a screen ends up with a light page and one dark value left over), or if the pin loses the
 * specificity it needs to win against the dark `:root`.
 *
 * It is the source half of the claim. The rendered half is the harness's `C8.pinned` and `C9.native`
 * gates, measured in a real browser at a dark-preferring viewport as well as a light one
 * (tools/visual-harness/run.mjs).
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const GLOBALS_CSS = readFileSync(join(ROOT, "src", "app", "globals.css"), "utf8");
const PAPER_PAGE = readFileSync(join(ROOT, "src", "components", "PaperPage.tsx"), "utf8");

/** The marker that separates the light palette from the dark one. `contrast.ts` splits on it as well. */
const DARK_MARKER = "@media (prefers-color-scheme: dark)";

/**
 * The selector that holds the paper still.
 *
 * It must not be plain `html`: the dark block sets the tokens on `:root`, which out-specifies a bare
 * element selector (0,1,0 against 0,0,1), so a plain `html` rule would lose and the dark palette would
 * win in dark mode. `html:has(.paper-page)` is (0,1,1) and wins whatever the order.
 */
const PIN_SELECTOR = "html:has(.paper-page)";

/** The switch class, written once, in the wrapper. */
const SWITCH_CLASS = "paper-page";

const APPLICATION_ROOTS = ["src/app", "src/components"] as const;

/**
 * The stylesheet with its comments removed. The file *explains* the pin as well as declaring it, and the
 * explanation names the selector, so reading the raw text would find the sentence instead of the rule.
 */
const DECLARATIONS = GLOBALS_CSS.replace(/\/\*[\s\S]*?\*\//g, "");

const PIN_AT = DECLARATIONS.indexOf(`${PIN_SELECTOR} {`);
const PIN_BLOCK = PIN_AT === -1 ? "" : DECLARATIONS.slice(PIN_AT, DECLARATIONS.indexOf("}", PIN_AT) + 1);

function listFiles(directory: string, keep: (name: string) => boolean): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
    const child = `${directory}/${entry.name}`;

    if (entry.isDirectory()) {
      found.push(...listFiles(child, keep));
    } else if (entry.isFile() && keep(entry.name)) {
      found.push(child);
    }
  }

  return found;
}

/** Every route the app serves: a `page.tsx` at any depth under src/app. */
const ROUTES = listFiles("src/app", (name) => name === "page.tsx").sort();

/** Every application source file, which is where the switch class may or may not be named. */
const APPLICATION_FILES = APPLICATION_ROOTS.flatMap((root) =>
  listFiles(root, (name) => name.endsWith(".ts") || name.endsWith(".tsx")),
).sort();

/** A file's source with its comments removed, so nothing passes by describing the class it must add. */
function code(file: string): string {
  return readFileSync(join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("palette scope", () => {
  it("finds every route, so a new screen cannot slip past this check", () => {
    assert.ok(ROUTES.length >= 7, `expected the application's routes to be scanned, found ${ROUTES.length}`);

    for (const route of [
      "src/app/page.tsx",
      "src/app/checkin/page.tsx",
      "src/app/journal/page.tsx",
      "src/app/journal/[id]/page.tsx",
      "src/app/settings/page.tsx",
      "src/app/sign-in/page.tsx",
      "src/app/sign-up/page.tsx",
    ]) {
      assert.ok(ROUTES.includes(route), `${route} must be scanned`);
    }
  });

  it("renders every route through the warm paper, ahead of the shell", () => {
    for (const route of ROUTES) {
      const source = code(route);

      assert.ok(
        source.includes('import PaperPage from "@/components/PaperPage";'),
        `${route} must import the PaperPage wrapper`,
      );
      assert.ok(source.includes("<PaperPage>"), `${route} must render the PaperPage wrapper`);
      assert.ok(source.includes("<Screen"), `${route} must still render the Screen shell`);

      // Order matters: the wrapper is what puts the class on the page, so it has to be outside the shell.
      assert.ok(
        source.indexOf("<PaperPage>") < source.indexOf("<Screen"),
        `${route} must wrap the shell, not sit inside it`,
      );
    }
  });

  it("lets nothing but the wrapper add the switch class", () => {
    const users = APPLICATION_FILES.filter((file) => code(file).includes(SWITCH_CLASS));

    assert.deepEqual(
      users,
      ["src/components/PaperPage.tsx"],
      "these files name the switch class; the stylesheet's scope reads it, so PaperPage owns it",
    );
    assert.match(PAPER_PAGE, /className="paper-page\b/, "the wrapper must add the class the stylesheet reads");
  });

  it("holds the paper still, whatever colour scheme the browser asks for", () => {
    const light = readPalettes(GLOBALS_CSS).light;
    const pinned = readColourTokens(PIN_BLOCK);

    assert.ok(PIN_AT !== -1, `the stylesheet must declare the pin: ${PIN_SELECTOR}`);
    assert.deepEqual(
      Object.keys(pinned).sort(),
      Object.keys(light).sort(),
      "the pin must restate every colour token; one left out stays dark on a dark-preferring browser",
    );

    for (const [name, value] of Object.entries(light)) {
      assert.equal(pinned[name], value, `--color-${name} is not pinned to the light palette's ${value}`);
    }
  });

  it("keeps the pin above the dark block, and specific enough to win", () => {
    const selector = DECLARATIONS.slice(PIN_AT, DECLARATIONS.indexOf("{", PIN_AT)).trim();

    assert.equal(selector, PIN_SELECTOR, "the pin's selector is what makes it out-specify the dark :root");
    assert.ok(
      PIN_AT < DECLARATIONS.indexOf(DARK_MARKER),
      "the pin must stay above the prefers-color-scheme marker, which is how src/lib/contrast.ts reads one light palette",
    );
  });

  it("asks native controls, focus rings and scrollbars for the light colour scheme", () => {
    assert.match(
      PIN_BLOCK,
      /color-scheme:\s*light\s*;/,
      "the pin must declare color-scheme: light, or the page is ivory and the controls are not",
    );
  });

  it("keeps the dark palette declared, so the contrast tests keep measuring both", () => {
    const { light, dark } = readPalettes(GLOBALS_CSS);

    assert.ok(DECLARATIONS.includes(DARK_MARKER), "the dark palette must stay: contrast.ts splits the file on it");
    assert.notEqual(dark.paper, light.paper, "the dark palette must still be a palette of its own");
  });
});

