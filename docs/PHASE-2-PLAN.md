# SomaMap — Phase 2 durable implementation plan

**Status.** Phase 2.0 (the visual harness) is complete and accepted. This file records the approved
decisions and the acceptance criteria for the stages that follow, so the work can be measured
against a fixed target rather than a memory. It supplements `.clinerules` and the build blueprint
and **overrides neither**: where they disagree, they win.

**Where the evidence lives.** Every claim below is measured, not asserted: the gates are in
`tools/visual-harness/` (run by hand, never part of `npm test`), the unit checks are in
`src/lib/*.test.ts`, and the run-by-run record is appended to `BUILD-REPORT.md`.

---

## 1. Scope

Phase 2 makes the body map look like a body and makes the drawn figure and the fixed zone map
provably agree, in three views (Front, Back, Side), without changing what the product is. It is
**not** a redesign of the check-in flow, the interview, the card, the journal or settings, and it
adds no field, no interpretation and no new copy beyond the names approved in A7.

## 2. The five iron rules (restated; unchanged by this phase)

1. **Schema lock** — the card keeps exactly five fields; Phase 2 touches no schema, route or storage.
2. **Texture, not triage** — no question is written or reworded; the question bank is untouched.
3. **Patterns are vocabulary, not conditions** — nothing in Phase 2 counts, clusters or correlates.
4. **Crisis shield is numbers, not triage** — untouched; no symptom-based rule is added.
5. **Copy discipline** — the fixed line stays on every screen and the four prohibited stems stay out
   of rendered text; both are asserted by the harness on every run.

## 3. The approved decisions

| # | Decision | What it means concretely |
|---|---|---|
| **A1** | Implement the validated `SIDE_ZONES` and the planned region tests | the region data gains a third view whose zones reuse only the fourteen Table 9 labels; the region tests cover it |
| **A2** | Feet target 56 → 70 | the `feet` zone grows so its lower edge reaches the bottom of the drawing box |
| **A3** | Neck adjustment: head 125, neck 62, shoulder 71 | the three upper bands are re-sized so they still abut (`22 + 125 + 62 + 71 = 280`) |
| **A4** | Sticky disclaimer, **conditional** | implement only if every rejection gate passes, including at 320×568, during scrolling, and with the description field focused; otherwise keep the in-flow footer and document the limitation |
| **A5** | Dark-mode colours, **conditional** | the proposed values must pass the automated contrast checks *and* the rendered-style checks; if any required threshold fails they are not accepted |
| **A6** | The planned figure sizing | the same rendered height across views, and the drawing box must not stretch the map |
| **A7** | The five names | "Figure", "Neutral", "Feminine", "Masculine", "Side"; the description field stays optional and the supporting copy says so |
| **A8** | The narrower side view | accepted as narrower, and it must not be stretched to match the other views |

## 4. The map space (the geometry decision stage 2.1 implements)

The defect the harness measured (`S3.mapspace`, 10/10 failing): the zone map was authored in a
**1000 × 1000** space but drawn into a **100 × 160** box, so one map unit was 0.24 px across and
0.384 px down. Anything geometric in that space — a radius, an arc, a distance — rendered wrong, and
the map had no metric of its own.

The fix is to declare the space honestly, per view, instead of changing the drawing:

| View | Map space (units) | viewBox | One map unit |
|---|---|---|---|
| Front, Back | **1000 × 1600** | `0 0 100 160` | 0.1 viewBox units in **both** axes |
| Side | **480 × 1600** | `0 0 48 160` | 0.1 viewBox units in **both** axes |

- The viewBox is **derived** from the map space by a single constant (`VIEW_BOX_SCALE = 0.1`), so the
  drawing cannot stretch the map — it is structural, not arithmetic.
- The transform is therefore: **x unchanged; y = previous y × 1.6** (rounded to integers), because
  the previous y axis was a 0…1000 axis drawn into a 160-unit box. Every coordinate in the region
  data and in the silhouette receives the same transform, so the rendered figure is
  **pixel-identical** to the one the owner has already seen.
- A2 and A3 are quoted in the previous square axis; in the map's own units they are **feet 70 → 112,
  head 125 → 200, neck 62 → 99, shoulder 71 → 114** (the same physical lengths, ×1.6). The approved
  numbers are kept verbatim in the code comments.
- The side space is 480 units across — a profile is much shallower than it is wide — and shares the
  1600-unit height, which is what lets the three views render at one height (A6) while the side view
  stays narrower (A8).
- The region data stays **integer** in every axis, and the containment rule stays half-open, so the
  existing "a point lands in at most one zone" proof is unchanged.

## 5. Stages and acceptance criteria

Each stage must pass its own gates before the next begins. A stage that fails is reported as failed;
no threshold is relaxed to make one pass.

| Stage | Work | Acceptance (gates) |
|---|---|---|
| **2.0** ✅ | the visual harness | done — Entry 47 |
| **2.1** | region data and map-space transformations: per-view map spaces, the y transform, A2, A3, `SIDE_ZONES`, the planned region tests | `npm test` green; `S2.uniform` and `S3.mapspace` PASS at every viewport; **no gate that passed in 2.0 regresses** |
| **2.2** | the neutral Front and Back silhouettes, drawn as organic shapes that follow the zone geometry | `L1.form`, `L2.overhang`, `L2.coverage`, `L3.tap` PASS for Front and Back at 320×568, 390×844 and 1440×900 |
| **2.3** | the neutral Side silhouette, the Side view in the UI, height-driven figure sizing | the 2.2 gates PASS for Side; `S1.height`, `S4.side`, `S5.aspect` PASS; `N2.views` PASS |
| **2.4** | the Feminine and Masculine variants | the 2.2/2.3 gates PASS for all three figures; `N1.figure` PASS |
| **2.5** | A4 (sticky disclaimer) and A5 (dark colours), each conditional | all four `D*` gates, or the in-flow footer restored and the limitation documented; all `C*` gates in both schemes |

Stages 2.2 and 2.3 must not begin until 2.1 is green, and stage 2.4 must not begin until the neutral
figures pass `L2` and `L3`.

## 6. The L2 taxonomy: three cases, told apart

The strict containment rule is deliberately not a single pass/fail. The harness reports three
distinct measurements, so a legitimate contour is never confused with a defect:

| Reading | Meaning | Verdict |
|---|---|---|
| **Contour** | a zone edge that coincides with the silhouette's edge, within the sampling tolerance — the zone boundary *is* the body contour there | legitimate; not a failure |
| **Overhang** (`L2.overhang`) | zone geometry extends **outside** the drawn silhouette: the outline leaves the body, so a tap can select a region where no body is drawn | failure |
| **Coverage** (`L2.coverage`) | drawn silhouette area that **no zone covers**: a visible body area the user cannot tap | failure |

Two rules keep this honest:

1. **The sampling is dense where it matters.** The zone perimeter is sampled every 2 px and the
   interior on a coarse grid; a single perimeter point outside the silhouette fails the gate.
   Reporting the *maximum* overhang in pixels distinguishes a rounded corner (a few pixels, at a
   corner) from geometry that is simply in the wrong place (a whole edge).
2. **No tolerance is invented to pass.** The 2 px inset exists only to stay off the antialiased edge
   itself. It is a sampling detail, not a permitted error budget: a zone outline drawn outside the
   body is a defect however small, because the user can see it.


## 7. Open questions carried forward

1. **The plan's own text is not in this repository.** The decisions in §3 are the approved summary;
   the harness's gate names and the A-numbering were reconstructed (see `BUILD-REPORT.md` Entry 47
   §5.7 and §6). Two details remain assumptions: that "Figure" is a group of its own
   (Neutral/Feminine/Masculine) while "View" keeps Front/Back and gains Side; and the exact
   `SIDE_ZONES` geometry, which is derived here and must be **validated by `L2`/`L3`** when the side
   silhouette is drawn in stage 2.3.
2. **The Front view draws arms and hands but has no arm or hand zone** (they are Back-view regions in
   Table 9). `L2.coverage` is expected to report the front view's arms as untappable until stage 2.2
   decides whether to draw them or to add front-view zones for the same two labels.
3. **The `shoulder` zone is wider than the torso it is drawn over** (236…764 against 268…732 in the
   previous axis). That overhang is real and is left visible for stage 2.2 to resolve, rather than
   widened now, which would make the figure boxier before it is redrawn.
4. **Height-driven figure sizing** is required for stage 2.3 (a width-driven box would make the
   narrower side view taller). It is deliberately *not* changed in stage 2.1, so the front/back
   rendering the owner has already seen is untouched.

## 8. Repository rules observed by every stage

- No staging, committing, amending, pushing, resetting, stashing, cleaning or discarding.
- `.env.local` is never read or printed; `.clinerules` is never modified.
- `BUILD-REPORT.md` is appended to, never rewritten.
- Generated screenshots and temporary artifacts stay outside the repository.
- The harness stays standalone, dependency-free, and out of the default test suite.

