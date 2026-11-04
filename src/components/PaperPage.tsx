import type { ReactNode } from "react";

/**
 * The warm paper the product stands on - every screen renders through it.
 *
 * It exists because the same class string was about to be written into three routes, which is exactly the
 * drift `Screen` and `Button` were created to remove. The class is the switch the stylesheet reads:
 * `html:has(.paper-page)` in src/app/globals.css pins the light palette, so these pages hold SomaMap's
 * ivory in both colour modes instead of following the visitor's operating system preference.
 *
 * It began as the landing page's alone, then the two auth screens'; it now wraps every route - the
 * check-in, the journal, the saved card and settings - so the whole product holds one paper. The dark
 * palette stays in the stylesheet for the tokens' own resolution and the contrast tests, but no screen
 * opts into it, which is the point: a signed-in person must not watch the product change colour
 * underneath them.
 *
 * Tokens only, and no colour of its own: `bg-paper` is the page colour, and it resolves to the same ivory
 * the scope pins. src/lib/paletteScope.test.ts fails if a route renders without this wrapper.
 */
export default function PaperPage({ children }: { children: ReactNode }) {
  return <div className="paper-page flex min-h-screen flex-col bg-paper">{children}</div>;
}
