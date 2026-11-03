import type { ReactNode } from "react";

/**
 * The warm paper the product stands on - the pages a person meets before they have an account.
 *
 * It exists because the same class string was about to be written into three routes, which is exactly the
 * drift `Screen` and `Button` were created to remove. The class is the switch the stylesheet reads:
 * `html:has(.paper-page)` in src/app/globals.css pins the light palette, so these pages hold SomaMap's
 * ivory in both colour modes instead of following the visitor's operating system preference.
 *
 * Tokens only, and no colour of its own: `bg-paper` is the page colour, and it resolves to the same ivory
 * the scope pins. Every screen behind a session keeps switching with the mode, so this is a deliberate
 * scope rather than a second palette.
 */
export default function PaperPage({ children }: { children: ReactNode }) {
  return <div className="paper-page flex min-h-screen flex-col bg-paper">{children}</div>;
}
