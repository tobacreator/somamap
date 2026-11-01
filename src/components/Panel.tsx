import type { ReactNode } from "react";

/**
 * A bounded block of content: the crisis contacts, the delete-everything switch, an interview
 * failure. Three sites shared the same rounded bordered box before this existed.
 *
 * The border uses the decorative separator token, not the control-boundary token: a panel groups
 * content, it is not something the user operates, so it is not held to the 3:1 requirement.
 */
export default function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-3 rounded-panel border border-rule p-4 ${className}`}>{children}</div>;
}
