import type { ReactNode } from "react";

import DisclaimerFooter from "@/components/DisclaimerFooter";

/**
 * The page shell - one column, one gutter, one rhythm, and the fixed line.
 *
 * Before Phase B this wrapper was copied into three route files, and the fixed line was rendered
 * separately by five components. Every screen now gets both from here, which is what makes
 * Section 9.2's "disclaimer in the same place on every screen" true by construction.
 *
 * The measures: `column` is the core content measure (640px, from the --width-column token);
 * `form` is the narrower one the sign-in screen uses, because a wide sign-in form is worse, not
 * better.
 *
 * The spacing tokens are used as CSS variables rather than as utilities: Tailwind 4.3.3 has no
 * `--spacing-*` namespace (only the single `--spacing` multiplier), so `px-gutter` would not exist.
 */
const WIDTHS = {
  column: "max-w-[var(--width-column)]",
  form: "max-w-[26.25rem]",
} as const;

export default function Screen({ children, width = "column" }: { children: ReactNode; width?: keyof typeof WIDTHS }) {
  return (
    <main
      className={`mx-auto flex w-full flex-1 flex-col gap-[var(--spacing-stack)] px-[var(--spacing-gutter)] py-8 ${WIDTHS[width]}`}
    >
      {children}
      <DisclaimerFooter />
    </main>
  );
}
