# SomaMap — Release Readiness

**Assessment date:** 2026-11-01. **Deadline:** approximately three days.
**Basis:** the recorded runs in `MVP-TRACEABILITY.md` §6, the gate results in §4, and the issue
register. Nothing in this document is a projection; every number is a measurement with a date.

---

## 1. The verdict, in one paragraph

**Conditionally ready.** The journey is complete and verified end to end on a production build, and the
card now faithfully represents what the user submitted: the session asks an approved comparison
question, a submitted comparison and a submitted duration reach their own fields in either order, a
bare "for" is no longer mistaken for a duration, filler no longer appears as a quality word, and the
quoted sentence no longer repeats the duration row. `/` opens the real application. Every visible part
of the body map is tappable and every tappable region is drawn, verified by the unchanged alignment
gates (16 gates moved from FAIL to PASS). Every compliance gate is green: the crisis stop, the copy
discipline, the strict five-field schema, the fail-closed model boundary, the privacy control, and 0
console errors across the whole harness run.

**Two P1 items remain, and both are proven rather than assumed.** The fixed line is below the fold on
phones: the sticky fix was built, measured and rejected because it covers the description field
(`D4` FAIL 7/10), so the documented in-flow fallback stands. And no zone can be 44×44 px on a phone -
the neck is 7.6% of the figure's width, so 44px needs a 579px-wide figure on a 320px screen. Neither is
a functional, compliance or data-integrity defect, and neither was papered over.

**What is still missing for a full sign-off:** a human walkthrough of the 20 UAT scenarios (§4 of
`UAT-REGISTER.md`), and a screen-reader pass. The machine half of every scenario is evidenced.

**Recommendation:** do the 20-minute human walkthrough, then demonstrate. Do not start the Side view,
the figure variants, or any research-blueprint feature.

---

## 2. Gate summary

| Area | Gate | Result | Date |
|---|---|---|---|
| Build | `npm run build` | PASS | 2026-11-01 |
| Types | `npx tsc --noEmit` | PASS | 2026-11-01 |
| Unit tests | `npm test` (unit) | **194/194 PASS** (was 185) | 2026-11-01 |
| Red team | `npm test` (red-team pack) | **8 PASS, 0 FAIL, 0 NOT IMPLEMENTED** | 2026-11-01 |
| Visual harness | full sweep | **176 PASS / 40 FAIL** (216 gates), 0 console errors (was 160/56) | 2026-11-01 |
| Body-map alignment | `L2.overhang`, `L2.coverage` | **8/8 PASS each** (was 8/8 FAIL each) | 2026-11-01 |
| Card fidelity | controlled cases | **16/16 PASS** (was 10/10) | 2026-11-01 |
| Entry point | redirect probe | **11/11 PASS** | 2026-11-01 |
| Accessibility | keyboard/structure probe | **13/13 PASS** | 2026-11-01 |
| Harness self-test | gate mechanics | **6/6 PASS** | 2026-10-31 |
| Compliance | crisis stop, copy scan, schema lock, model boundary | PASS | 2026-11-01 |
| Journey | check-in → card, region carried | PASS (machine) | 2026-11-01 |
| Privacy | delete-everything, live run | PASS | 2026-10-29 |

**The 40 remaining failures, by family:** the fixed line's fold position (`ISS-07`, 14 gates), the
44px touch-target family (`ISS-13`, 20 gates), and the Side view / figure variants that are not built
(`ISS-09`, 6 gates). No other gate fails.

## 3. Demonstration readiness, step by step

Against `MVP-SCOPE.md` §8:

| Step | Ready? | Note |
|---|---|---|
| D-1 Open the app at its entry point | **YES** | `/` redirects to `/checkin`; verified in a real browser on the production build |
| D-2 Tap a body region | **YES** | Region named from the fixed map; pin drawn; one zone selected; every drawn part is tappable |
| D-3 Type words and continue | **YES** | The field is optional and says so |
| D-4 Answer three questions | **YES** | Approved wordings, one at a time; the third is the approved comparison question |
| D-5 See the card | **YES** | Five rows, correct order, verbatim words, no fabrication; a missing answer reads "Not answered yet" |
| D-6 Show the crisis path | **YES** | Four contacts, nothing saved, clean return |
| D-7 Show the privacy control | **CONDITIONAL** | Needs the local Supabase stack and a session (`ISS-08`) |
| D-8 The honesty check | **YES** | Nothing interprets, scores, advises or names a cause; the fixed line renders on every screen - on a phone it is one swipe below the fold (`ISS-07`) |

---

## 4. What has to happen, in order, in the remaining time

| Order | Work | Issue | Status | Risk if skipped |
|---|---|---|---|---|
| 1 | Replace `/` with a redirect to `/checkin` | `ISS-01` | **DONE** — 11/11 verified | — |
| 2 | Remove the bare `"for"` from `TIME_WORDS`, with regression cases | `ISS-03` | **DONE** — `CF-09`..`CF-09d` | — |
| 3 | Add the approved comparison question and wire the metaphor row | `ISS-02` | **DONE** — Q14 in the bank, the session asks it, `CF-08`/`CF-16`..`CF-18` | — |
| 4 | Filter filler from `quality_words`; stop the sentence repeating the duration | `ISS-04`, `ISS-05` | **DONE** — `CF-10`, `CF-19`, `CF-20` | — |
| 5 | Draw each view's figure from its own zones | `ISS-06` | **DONE** — `L2.overhang`/`L2.coverage` 8/8 PASS each | — |
| 6 | Try the sticky disclaimer and measure it | `ISS-07` | **DONE — attempted and rejected.** `D4` FAIL 7/10 (covers the field); the in-flow footer stands | The line stays one swipe below the fold on a phone |
| 7 | Walk the 20 UAT scenarios on a phone-sized window and sign the register | `UAT-REGISTER.md` §4 | **NOT DONE — needs a human, ~20 minutes** | Nothing is human-verified; the machine half is all there is |
| 8 | Screen-reader pass | UAT-14 | **NOT DONE — needs a screen reader and a person who uses one** | The keyboard half is measured (13/13); the spoken half is unverified |
| — | **Do not attempt**: the Side view, the figure variants, colour changes, any research-blueprint feature, any new card field, any scoring, tagging, journal, trend or report | `ISS-09`, `ISS-10` | — | Each would break the MVP's scope discipline, and some would break iron rules |

**Only item 7 (and optionally 8) stands between this build and a fully signed-off demonstration.**

---

## 5. Residual risk

| Risk | Likelihood | Consequence | Mitigation |
|---|---|---|---|
| The body-map work overruns and leaves the app mid-change | Medium | A broken figure on demo day | Do it only after 1–4; the harness verifies every step; today's figure is ugly but works |
| The `"for"` fix breaks a fidelity test unexpectedly | Low | A red suite near the deadline | The change is one list entry; the suite runs in ~2 s; revert is one line |
| The local Supabase stack is not running for the privacy demo | Medium | `UAT-16` cannot be shown | Start it before the session, or show the screen's honest "configuration problem" state |
| A reviewer opens `/` | High if unfixed | The first impression is the scaffold | Item 1 |
| A reviewer asks why two card rows are empty | High if unscripted | Looks like an unfinished feature | Item 3: explain the rule — the card shows only what the person said, and says so |
| The deadline forces a choice between polish and evidence | Medium | A beautiful demo with no UAT record | Prefer item 4 (evidence) over item 5 (polish) |

---

## 6. What is *not* being claimed

- **No human has run the UATs.** Every `PASS` in `UAT-REGISTER.md` is the machine-checkable half, and
  the register says so in every row that carries a `*`. A 20-minute walkthrough (§4 there) is the
  remaining human step.
- **No screen-reader pass has been made.** Keyboard access, names, focus cues and the exposed structure
  are measured; how it *sounds* is not.
- **`ISS-07` and `ISS-13` are open.** The first is a measured limitation with the fallback the owner
  specified; the second is an arithmetic impossibility on a phone, with three options recorded for the
  owner. Neither is papered over and neither gate was weakened.
- **The body map is a map, not an illustration.** It draws exactly the body each view can name - so the
  front view shows head, neck, shoulders, torso and legs, and the back view shows the torso, arms,
  hands, knees and feet, because Table 9 gives the back view no head, neck, thigh or shin regions. The
  alternative (adding those regions to the back view) is a region-contract change and is recorded as an
  owner decision.
- **The Side view and the figure variants are not built** (`ISS-09`). They are planned work and out of
  this MVP's scope.
- **The research blueprint is not the roadmap.** It is recorded as future candidates; two of its
  proposals (red-flag routing, severity and context capture) are **rejected**, not deferred.
- **Nothing is committed, pushed or deployed.** The working tree is exactly as the owner left it, plus
  the documents in `docs/mvp/`, the harness, and the source changes listed in `BUILD-REPORT.md`
  Entry 50.

