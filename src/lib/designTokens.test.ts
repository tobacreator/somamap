import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { contrastRatio, readPalettes, readTokenNames } from "./contrast.ts";

/**
 * The design foundation's objective check - Phase A of the approved direction
 * (BUILD-REPORT.md Entry 37, sections 6.2 to 6.5).
 *
 * This test holds no copy of the palette. It reads src/app/globals.css - the file the browser
 * receives - and recomputes every ratio from those exact values, so a colour cannot drift below
 * its requirement while a stale number in a comment keeps looking right. If a token is renamed or
 * removed, the test fails on the missing name rather than silently checking nothing.
 */

const GLOBALS_CSS = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

/** WCAG 2.1 AA: 4.5:1 for normal text. */
const TEXT = 4.5;
/** WCAG 2.1 AA: 3:1 for graphical objects and user-interface components. */
const NON_TEXT = 3;

type RequiredPair = {
  /** What the pair is, in the words of the screen it appears on. */
  pair: string;
  foreground: string;
  background: string;
  needs: number;
};

/**
 * Every colour pair the interface actually renders, with the ratio it must reach. The body map's
 * pairs are the ones the audit measured as failing before this phase (2.56:1 outlines, about
 * 1.25:1 fills); the rest guard the tokens the foundation introduces.
 */
const REQUIRED_PAIRS: readonly RequiredPair[] = [
  { pair: "body text: ink on paper", foreground: "ink", background: "paper", needs: TEXT },
  {
    pair: "muted text: step label, the fixed line, hints",
    foreground: "ink-muted",
    background: "paper",
    needs: TEXT,
  },
  {
    pair: "region readout: clay as text on paper",
    foreground: "accent-text",
    background: "paper",
    needs: TEXT,
  },
  {
    pair: "pressed segment: accent ink on clay",
    foreground: "accent-ink",
    background: "accent",
    needs: TEXT,
  },
  { pair: "destructive action text on paper", foreground: "danger-text", background: "paper", needs: TEXT },
  { pair: "body map zone outline on the page", foreground: "hairline", background: "paper", needs: NON_TEXT },
  {
    pair: "body map zone outline on the figure",
    foreground: "hairline",
    background: "surface",
    needs: NON_TEXT,
  },
  { pair: "body map selected zone fill on the page", foreground: "accent", background: "paper", needs: NON_TEXT },
  {
    pair: "body map selected outline and pin ring on the selected fill",
    foreground: "paper",
    background: "accent",
    needs: NON_TEXT,
  },
  { pair: "body map pin core against its own ring", foreground: "ink", background: "paper", needs: NON_TEXT },
  { pair: "destructive action border on paper", foreground: "danger", background: "paper", needs: NON_TEXT },
];

/** Tokens the foundation promises beyond colour, including the line height of every type step. */
const REQUIRED_TOKENS: readonly string[] = [
  "--font-sans",
  "--font-serif",
  "--font-mono",
  "--text-meta",
  "--text-meta--line-height",
  "--text-label",
  "--text-label--line-height",
  "--text-body",
  "--text-body--line-height",
  "--text-lead",
  "--text-lead--line-height",
  "--text-question",
  "--text-question--line-height",
  "--text-display",
  "--text-display--line-height",
  "--spacing-gutter",
  "--spacing-stack",
  "--radius-control",
  "--radius-panel",
  "--radius-pill",
  "--width-column",
];

const palettes = readPalettes(GLOBALS_CSS);
const tokenNames = readTokenNames(GLOBALS_CSS);

describe("design tokens", () => {
  it("declares both a light and a dark palette, with the same names in each", () => {
    const light = Object.keys(palettes.light).sort();
    const dark = Object.keys(palettes.dark).sort();

    assert.ok(light.length > 0, "the light palette must declare colour tokens");
    assert.deepEqual(
      dark,
      light,
      "every colour token must have a dark value, or dark mode silently keeps the light one",
    );
  });

  it("declares every token the interface uses, so a rename cannot check nothing", () => {
    for (const mode of ["light", "dark"] as const) {
      for (const { foreground, background } of REQUIRED_PAIRS) {
        for (const name of [foreground, background]) {
          assert.ok(
            palettes[mode][name] !== undefined,
            `${mode} palette is missing the "${name}" colour token`,
          );
        }
      }
    }

    for (const name of REQUIRED_TOKENS) {
      assert.ok(tokenNames.has(name), `the stylesheet is missing the ${name} token`);
    }
  });

  it("meets every required ratio in both modes, measured from the stylesheet's own values", () => {
    for (const mode of ["light", "dark"] as const) {
      for (const { pair, foreground, background, needs } of REQUIRED_PAIRS) {
        const measured = contrastRatio(palettes[mode][foreground], palettes[mode][background]);

        assert.ok(
          measured >= needs,
          `${mode} ${pair}: ${measured.toFixed(2)}:1 is below ${needs}:1 (${foreground} ${palettes[mode][foreground]} on ${background} ${palettes[mode][background]})`,
        );
      }
    }
  });

  it("keeps the body map's zone outlines clear of the 3:1 line the audit measured them below", () => {
    // The audit measured 2.56:1 for the zone outline in both modes. This is the specific
    // regression guard for that finding, on both surfaces an outline is drawn against.
    for (const mode of ["light", "dark"] as const) {
      const onPage = contrastRatio(palettes[mode].hairline, palettes[mode].paper);
      const onFigure = contrastRatio(palettes[mode].hairline, palettes[mode].surface);

      assert.ok(onPage >= NON_TEXT, `${mode} zone outline on the page: ${onPage.toFixed(2)}:1`);
      assert.ok(onFigure >= NON_TEXT, `${mode} zone outline on the figure: ${onFigure.toFixed(2)}:1`);
    }
  });

  it("declares a dark palette that is genuinely different from the light one", () => {
    for (const [name, lightValue] of Object.entries(palettes.light)) {
      assert.notEqual(
        palettes.dark[name],
        lightValue,
        `the dark palette repeats the light value for "${name}", so that token would not switch`,
      );
    }
  });

  it("no longer overrides the loaded interface font", () => {
    // The audit's finding: the scaffold's body rule set Arial and beat the Geist variables that
    // src/app/layout.tsx loads, so the app shipped a font it never showed.
    //
    // Comments are stripped first: this file *describes* the removed rule, and the check is about
    // what the stylesheet declares, not about what it explains.
    const declarations = GLOBALS_CSS.replace(/\/\*[\s\S]*?\*\//g, "");

    assert.equal(/Arial/i.test(declarations), false, "globals.css must not declare Arial");
    assert.equal(
      /font-family/.test(declarations),
      false,
      "globals.css must not set font-family; the family comes from the font-sans utility",
    );
  });

  it("keeps the compatibility aliases the scaffold landing page still uses", () => {
    // / is out of scope for this phase, so bg-foreground and text-background must keep resolving
    // to the palette rather than going undefined.
    assert.match(GLOBALS_CSS, /--color-background:\s*var\(--color-paper\)/);
    assert.match(GLOBALS_CSS, /--color-foreground:\s*var\(--color-ink\)/);
  });
});

