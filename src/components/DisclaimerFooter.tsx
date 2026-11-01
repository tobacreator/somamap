import { DISCLAIMER_LINE } from "@/lib/copy";

/**
 * The fixed line - iron rule 5's sentence, one component, one home.
 *
 * Before Phase B this line was written out at eight render sites across five files, which is how a
 * card screen ended up showing it twice. It now renders once per screen, from the `Screen` shell,
 * so "the disclaimer line in the same place on every screen" (blueprint Section 9.2) is structural
 * rather than remembered.
 *
 * It follows the content instead of being pinned to the bottom of the viewport: a short screen ends
 * with the line where the page ends, rather than with a void above a stranded footer (audit
 * Entry 37, section 4.4).
 *
 * **The pinning question was re-opened and measured (ISS-07, 2026-11-01).** A sticky variant
 * (`sticky bottom-0 z-10 bg-paper`) was built and put through the four placement gates on the
 * production build:
 *
 *   - `D1.firstScreen` PASS 10/10 (was 3/10) - the line is on the first screen;
 *   - `D2.scrolling` PASS 10/10 (was 3/10) - the line stays visible at every scroll position;
 *   - `D3.focus` PASS 3/3 - and it does not cover the focused field;
 *   - `D4.noOcclusion` **FAIL 7/10** - it covers the **description field**: 4 positions at 320x568
 *     (first at scroll y=309) and 6 at 390x844, including scroll position 0.
 *
 * A pinned footer overlays whatever content flows through the bottom of the viewport, and the
 * description field is in that band on every phone width, so no pinning can satisfy `D4` while the
 * field sits below the fold. The owner's instruction was explicit for this case: if sticky fails an
 * acceptance gate, keep the in-flow footer and record the limitation. That is what this is - the
 * limitation is that on a phone the line is below the fold (it is visible without scrolling from
 * 768px up), and the mitigation is that the line is *rendered* on every screen at every viewport
 * (`P1.line` 11/11, the copy scan clean) and is reached by one swipe.
 */
export default function DisclaimerFooter() {
  return (
    <footer className="border-t border-rule pt-4">
      <p className="text-meta leading-5 text-ink-muted">{DISCLAIMER_LINE}</p>
    </footer>
  );
}
