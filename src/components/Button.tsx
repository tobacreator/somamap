import type { ButtonHTMLAttributes } from "react";

/**
 * The one button: three variants plus a filled destructive confirm, all on the design tokens.
 *
 * What it fixes: the primary class string was copied at four sites, the secondary at four, the
 * destructive at two, and the disabled state was `opacity-50` - a grey pill that reads as broken
 * rather than as "not yet". Every control is at least 44px tall on the mobile layout, where the old
 * pills were about 36px and the body map's view toggle about 32px.
 *
 * The focus ring is a shared constant so the map's segmented control can use exactly the same one
 * without importing a button it is not.
 */
export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * `accent-ink` is the ink used on a strong fill, whatever that fill is: it is white in light mode
 * and near-black in dark, which is exactly what the clay and the danger fills need as they invert
 * with the mode. Both pairs are asserted in src/lib/designTokens.test.ts.
 */
const VARIANTS = {
  primary: "bg-accent text-accent-ink hover:bg-accent/90 disabled:bg-surface disabled:text-ink-muted",
  secondary: "border border-hairline text-ink hover:bg-tint disabled:text-ink-muted",
  danger: "border border-danger text-danger-text hover:bg-danger/10 disabled:border-hairline disabled:text-ink-muted",
  dangerSolid: "bg-danger text-accent-ink hover:bg-danger/90 disabled:bg-surface disabled:text-ink-muted",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS };

export default function Button({ variant = "primary", type = "button", className = "", ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-pill px-5 text-label font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${FOCUS_RING} ${className}`}
    />
  );
}
