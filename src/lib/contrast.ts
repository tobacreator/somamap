/**
 * Contrast maths and the token reader - the objective half of the design foundation
 * (BUILD-REPORT.md Entry 37, section 6.2).
 *
 * The palette lives in src/app/globals.css as tokens. This module deliberately keeps no second
 * copy of it: it reads that file, so the numbers a test asserts are the numbers the browser
 * receives, and a colour cannot be changed in one place while a check keeps passing on a stale
 * value.
 *
 * The maths is WCAG 2.1: linearise the sRGB channels, weight them, then compare as
 * (lighter + 0.05) / (darker + 0.05). Anything that is not a hex colour throws rather than
 * returning a number, so a malformed token fails the check instead of passing it.
 */

/** One sRGB channel, linearised exactly as WCAG 2.1 specifies. */
function linearise(channel: number): number {
  const value = channel / 255;

  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** The three channels of a #rgb or #rrggbb colour. */
function channels(colour: string): { r: number; g: number; b: number } {
  const hex = colour.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map((digit) => digit + digit).join("") : hex;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`not a hex colour: ${JSON.stringify(colour)}`);
  }

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** The relative luminance of a colour, 0 (black) to 1 (white). */
export function relativeLuminance(colour: string): number {
  const { r, g, b } = channels(colour);

  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** The WCAG contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return (lighter + 0.05) / (darker + 0.05);
}

/** Colour tokens by name, without the `--color-` prefix. */
export type ColourTokens = Readonly<Record<string, string>>;

/**
 * Every `--color-<name>: <hex>` declaration in a piece of CSS, keyed by `<name>`.
 *
 * Only literal hex values are read: an alias such as `--color-background: var(--color-paper)` is
 * skipped on purpose, because an alias is not a colour of its own and resolving it here would
 * duplicate the cascade.
 */
export function readColourTokens(css: string): ColourTokens {
  const tokens: Record<string, string> = {};
  const pattern = /--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;

  for (const match of css.matchAll(pattern)) {
    tokens[match[1]] = match[2];
  }

  return tokens;
}

/** The marker that separates the light palette from the dark one in globals.css. */
const DARK_MARKER = "@media (prefers-color-scheme: dark)";

/** The light palette, and the same names as dark mode overrides them. */
export type Palettes = { light: ColourTokens; dark: ColourTokens };

/**
 * Both palettes from one CSS text. The dark values are whatever the file declares after the
 * prefers-color-scheme marker, which is how the stylesheet itself resolves them.
 */
export function readPalettes(css: string): Palettes {
  const at = css.indexOf(DARK_MARKER);

  if (at === -1) {
    throw new Error("no dark palette: the stylesheet declares no prefers-color-scheme block");
  }

  return { light: readColourTokens(css.slice(0, at)), dark: readColourTokens(css.slice(at)) };
}

/** Every `--token` name a CSS text declares, whatever its value. */
export function readTokenNames(css: string): ReadonlySet<string> {
  const names = new Set<string>();

  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:/g)) {
    names.add(match[1]);
  }

  return names;
}
