import type { ReactNode } from "react";

/**
 * The small label above a screen's title, or above a field's value.
 *
 * It replaced seven copies of `text-xs uppercase tracking-wide`, and it deliberately dropped the
 * uppercase: shouting "INTERVIEW" at someone who may be anxious is the opposite of calm, and
 * sentence case is what the copy itself already uses.
 */
export default function StepLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="text-meta font-medium text-ink-muted">
      {children}
    </p>
  );
}
