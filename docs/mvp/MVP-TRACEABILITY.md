# SomaMap — MVP Traceability

**Purpose:** every MVP feature linked to its acceptance criteria, the automated tests that cover it,
its UAT case, its implementation status, and the evidence that the status is true. Written
2026-11-01; see `MVP-SCOPE.md` for what the MVP is and `.clinerules` for what it may never be.

**The rule this document exists to enforce:** *nothing is marked passed because a test exists.* A
status is `PASS` only where a run actually happened and its result is quoted. Everything else is
`IMPLEMENTED (UNVERIFIED)`, `PARTIAL`, `DEFECT`, `MISSING` or `NOT RUN`.

---

## 0. How to read this document

### ID conventions (stable; never reused)

| Prefix | Meaning | Example |
|---|---|---|
| `F-nn` | MVP feature | `F-05` the five-field card |
| `R-nn` | Requirement the feature must satisfy | `R-06` exactly five fields |
| `AC-nn.n` | Acceptance criterion for a feature | `AC-05.2` |
| `UT-<file>` | Automated unit test file | `UT-cardFidelity` |
| `RT-Tn` | Red-team row | `RT-T3` |
| `VH-<gate>` | Visual-harness gate | `VH-L3.tap` |
| `UAT-nn` | Manual UAT case | `UAT-05` |
| `ISS-nn` | Issue or blocker | `ISS-01` |
| `RB-Fn` | Research-blueprint feature, recorded as a future candidate | `RB-F8` |

### Status vocabulary

| Status | Means |
|---|---|
| `PASS` | Executed, with the result quoted and a date |
| `IMPLEMENTED (UNVERIFIED)` | The code exists and type-checks; no execution evidence in this document |
| `PARTIAL` | Some criteria pass, others do not; the failing ones are named |
| `DEFECT` | Implemented, executed, and demonstrably wrong in a named way |
| `MISSING` | Not built |
| `NOT RUN` | Cannot be judged without a human, a device, or an environment that is not available |
| `REJECTED` | Considered and deliberately not built, with the reason |

### Evidence rules

1. Evidence is a **command and its result**, a **dated report entry**, or a **screenshot path**. It is
   never "the test file exists".
2. Where a claim rests on an earlier entry, the entry number is cited (`BUILD-REPORT.md` Entry nn).
3. Automated evidence covers *code behaviour*. It does not cover look, feel, or a human's judgement;
   those stay `NOT RUN` until a person runs them.

---

## 1. Features, requirements and acceptance criteria

### F-01 · Fixed body map (front/back, 14 regions)

| | |
|---|---|
| **Requirements** | `R-01` a tap names a region from the fixed geometric map; `R-02` that label travels to the card; `R-16` the label never comes from model output; `R-19` no horizontal scroll at 320px; `R-20` every zone ≥ 44×44 px; `R-22` keyboard-operable |
| **AC-01.1** | Three fixed coordinates resolve to the same three labels on every call, in every view |
| **AC-01.2** | The 14 Table 9 labels are present; the zones of a view are disjoint (a point names at most one region) |
| **AC-01.3** | A tap at a zone's centre names exactly that zone: one zone pressed, the readout matching, the pin inside the zone |
| **AC-01.4** | Every interactive control is ≥ 44 px tall and every zone ≥ 44×44 px |
| **AC-01.5** | No horizontal scrolling, no overlapping controls, no clipped text at any tested viewport |
| **AC-01.6** | Every zone outline is drawn **on** the figure, and every drawn part of the figure can be tapped |
| **Automated** | `UT-regions` (13 tests); `VH-L1.form`, `VH-L2.overhang`, `VH-L2.coverage`, `VH-L3.tap`, `VH-S1..S5`, `VH-T1..T6` |
| **UAT** | `UAT-02`, `UAT-03`, `UAT-12`, `UAT-14` |
| **Status** | **PASS** for AC-01.1, AC-01.2, AC-01.3, AC-01.5, **AC-01.6** (216-gate harness run, 2026-11-01). AC-01.4 (touch targets) **fails** and is tracked as `ISS-13`: the neck is 7.6% of the figure's width, so 44px is unreachable on a 320px screen |
| **Evidence** | `VH-L2.overhang` 8/8 PASS, `VH-L2.coverage` 8/8 PASS, `VH-L3.tap` 8/8 PASS; `%TEMP%\somamap-phase2\somamap-phase2-report.json` |

### F-02 · Optional free-text description

| | |
|---|---|
| **Requirements** | `R-03` the description field is optional and says so |
| **AC-02.1** | The field has no `required` attribute and the supporting copy states it may be left blank |
| **AC-02.2** | Continuing with an empty field still reaches the interview |
| **Automated** | `VH-N3.optional` (passes: `required=false`, placeholder "Type a few words, or leave it blank.") |
| **UAT** | `UAT-04` |
| **Status** | **PASS** for AC-02.1 (harness, 2026-10-31). AC-02.2 **NOT RUN** as a UAT (the harness always types text before continuing) |
| **Evidence** | Entry 48 §4, gate `N3.optional` |

### F-03 · Crisis stop

| | |
|---|---|
| **Requirements** | `R-09` crisis language stops the loop and saves nothing; `R-10` the four contacts, verbatim; `R-11` the user's words are never echoed; `R-14` no interpretation |
| **AC-03.1** | Every lexicon phrase stops the loop, whatever the case or punctuation |
| **AC-03.2** | Ordinary check-in text does **not** stop the loop |
| **AC-03.3** | The crisis state carries no card and nothing to save |
| **AC-03.4** | The screen shows 988 (US), 116 123 (UK), 112 (Nigeria and the EU), findahelpline.com — and nothing invented |
| **AC-03.5** | Back navigation returns to an empty check-in |
| **Automated** | `UT-crisis` (7), `RT-T1` (PASS), `UT-interview` "lets crisis language stop the loop, mid-session, with nothing carried forward", `UT-interviewFlow` "stops at the crisis answer, with no card in the state at all" |
| **UAT** | `UAT-08`, `UAT-09` |
| **Status** | **PASS** (automated, `npm test` 2026-10-31). The human-facing behaviour (`UAT-08`) is **NOT RUN** |
| **Evidence** | `npm test` 2026-10-31: `T1 crisis phrase PASS`; Entry 48 §4 |

### F-04 · Three-question interview from the reviewed bank

| | |
|---|---|
| **Requirements** | `R-04` three questions per session, wording always from the bank; `R-05` an unknown id falls back to the bank's first question and no question is ever invented; `R-14` no clinical provocation |
| **AC-04.1** | The sequence comes from the adapter; the wording always comes from the bank |
| **AC-04.2** | An id the bank does not know falls back to Q1 — never a new question |
| **AC-04.3** | Answers that do not match the questions actually asked are refused |
| **AC-04.4** | No question in the bank carries a provocation verb or names a cause, system or condition |
| **AC-04.5** | Progress reads "Question n of 3" and never runs ahead of the question on screen |
| **Automated** | `UT-interview` (12), `UT-interviewFlow` (19), `UT-questionBank` (5), `RT-T6` (PASS) |
| **UAT** | `UAT-05`, `UAT-06` |
| **Status** | **PASS** (automated, `npm test` 2026-10-31: 185/185 unit tests, `T6 bank audit PASS`). `UAT-05/06` **NOT RUN** |
| **Evidence** | `npm test` 2026-10-31 |

### F-05 · The five-field sensation card

| | |
|---|---|
| **Requirements** | `R-06` exactly five fields, `.strict()`; `R-07` every value the user's own or empty; `R-08` an invalid card renders the reviewed fallback and is recorded as a category |
| **AC-05.1** | A payload with a sixth key is rejected outright |
| **AC-05.2** | A field the user did not fill is empty and renders as "Not answered yet" — never a placeholder, never a guess |
| **AC-05.3** | A comparison the user submitted reaches `intensity_metaphor`; a duration they submitted reaches `duration`; the two never swap |
| **AC-05.4** | The user's words are displayed verbatim, never reworded |
| **AC-05.5** | The card carries the region the user tapped |
| **Automated** | `UT-schema` (2), `UT-cardFidelity` (11), `UT-cardFidelity.answers` (**16**), `UT-cardView` (7), `UT-interview` "keeps the region the user selected…", `RT-T2`, `RT-T3` |
| **UAT** | `UAT-07`, `UAT-10`, `UAT-11` |
| **Status** | **PASS.** AC-05.1, AC-05.2, AC-05.4, AC-05.5 pass; AC-05.3 passes in 16/16 controlled cases. The four defects found on 2026-11-01 are **resolved**: the session asks the owner-approved comparison question (`ISS-02`), the bare "for" is no longer a duration (`ISS-03`), filler is filtered from `quality_words` (`ISS-04`), and the quoted sentence no longer repeats the duration row (`ISS-05`) |
| **Evidence** | `node --test src/lib/cardFidelity.answers.test.ts` 2026-11-01: 16/16 pass; `npm test`: 194/194 unit; `ISSUES-AND-BLOCKERS.md` §3 |

### F-06 · Copy discipline

| | |
|---|---|
| **Requirements** | `R-12` the fixed line on every screen, from one component; `R-13` the four forbidden words never in UI copy |
| **AC-06.1** | The fixed line renders on every screen at every viewport |
| **AC-06.2** | No prohibited stem is present in rendered text |
| **AC-06.3** | The line is rendered from exactly one component |
| **Automated** | `UT-tokenDiscipline` (7), `RT-T5` (PASS), `VH-P1.line` (11/11), `VH-P2.copy` (10/10) |
| **UAT** | `UAT-13` |
| **Status** | **PASS** for the rendered line and the copy scan (harness + `npm test`, 2026-10-31). Visibility *above the fold* **fails**: `D1.firstScreen` 7/10, `D2.scrolling` 7/10 — the line renders on every screen but sits below the fold on phones (`ISS-07`) |
| **Evidence** | Entry 48 §4; `%TEMP%\somamap-phase2\somamap-phase2-report.json` |

### F-07 · Server-side model boundary

| | |
|---|---|
| **Requirements** | `R-15` all model calls server-side, no key in client code; `R-08` fail closed |
| **AC-07.1** | Mock mode derives the card from the session; it never replays a recorded card |
| **AC-07.2** | A provider failure fails closed to the reviewed fallback |
| **AC-07.3** | A refusal is recorded as a category: key names, question ids, mode — never content |
| **AC-07.4** | Live mode without a provider fails closed on every call |
| **Automated** | `UT-models` (15), `RT-T2`, `RT-T4` |
| **UAT** | `UAT-15` |
| **Status** | **PASS** (automated, `npm test` 2026-10-31) |
| **Evidence** | `npm test` output: `T2 advice injection PASS`, `T4 prompt injection PASS` |

### F-08 · Privacy controls (sign in, delete everything)

| | |
|---|---|
| **Requirements** | `R-17` delete removes rows and storage objects and preserves the account; `R-18` the check-in path persists nothing |
| **AC-08.1** | One confirmation, then rows and storage objects are removed; the account remains |
| **AC-08.2** | A partial failure is reported as a failure and the rows are left alone |
| **AC-08.3** | Emptiness is verified independently of what the delete claimed |
| **AC-08.4** | Only a category crosses to the browser — never a URL, a key or a token |
| **Automated** | `UT-deleteEverything` (8), `UT-storageObjects` (13), `UT-supabaseTarget` (20), `RT-T8` (PASS, live run recorded 2026-10-29) |
| **UAT** | `UAT-16` |
| **Status** | **PASS** (automated, plus the live run recorded in `RT-T8`). Requires a running Supabase and a signed-in session; `UAT-16` **NOT RUN** in this environment |
| **Evidence** | `npm test` 2026-10-31: `T8 delete-all PASS`; Entry 23 |

### F-09 · Responsive, accessible phone-first layout

| | |
|---|---|
| **Requirements** | `R-19`, `R-20`, `R-21` contrast AA in both schemes, `R-23` dark mode |
| **AC-09.1** | No horizontal scrolling, no overlap, no clipping from 320×568 to 1440×900 |
| **AC-09.2** | Contrast meets WCAG AA in light **and** dark, measured from rendered colours |
| **AC-09.3** | Dark mode switches by token, with no hand-switched colour |
| **AC-09.4** | Every interactive control is ≥ 44 px tall |
| **Automated** | `UT-designTokens` (7), `UT-tokenDiscipline` (7), `VH-T3..T6`, `VH-C1..C7` |
| **UAT** | `UAT-12`, `UAT-14` |
| **Status** | **PARTIAL.** AC-09.1 and AC-09.2 **PASS** (28/28 contrast gates, both schemes, 2026-10-31). AC-09.3 **PASS** (`UT-tokenDiscipline`). AC-09.4 **fails** (10/10 viewports) |
| **Evidence** | Entry 48 §4; `%TEMP%\somamap-phase2\somamap-phase2-report.json` |


## 2. Requirements index

| ID | Requirement | Features | Status |
|---|---|---|---|
| R-01 | A tap names a region from the fixed geometric map | F-01 | PASS |
| R-02 | The selected region label travels to the card | F-01, F-05 | PASS |
| R-03 | The description field is optional and says so | F-02 | PASS |
| R-04 | Three questions per session, wording always from the bank | F-04 | PASS |
| R-05 | No question is ever invented; an unknown id falls back to Q1 | F-04 | PASS |
| R-06 | A card has exactly five fields, enforced with `.strict()` | F-05 | PASS |
| R-07 | Every card value is the user's own material, or empty | F-05 | PASS |
| R-08 | An invalid card renders the reviewed fallback; the refusal is a category | F-05, F-07 | PASS |
| R-09 | Crisis language stops the loop and saves nothing | F-03 | PASS |
| R-10 | The crisis screen shows the four contacts, verbatim | F-03 | PASS |
| R-11 | The crisis screen never echoes the user's words | F-03 | PASS |
| R-12 | The fixed line renders on every screen, from one component | F-06 | PASS (rendered); below the fold on phones — `ISS-07` |
| R-13 | The four forbidden words never appear in UI copy | F-06 | PASS |
| R-14 | No advice, interpretation, cause, diagnosis or recommendation anywhere | F-03, F-04, F-05 | PASS |
| R-15 | Model calls are server-side; no key in client code | F-07 | PASS |
| R-16 | The region label never comes from model output | F-01, F-05 | PASS |
| R-17 | Delete removes rows and storage objects, preserves the account | F-08 | PASS |
| R-18 | The check-in and interview paths persist nothing | F-03, F-08 | PASS |
| R-19 | No horizontal scrolling at 320 px and above | F-01, F-09 | PASS |
| R-20 | Every interactive control is ≥ 44 px tall | F-01, F-09 | **FAIL** — unreachable on a phone (`ISS-13`); 24.3px at 768px+ |
| R-21 | Contrast meets WCAG AA in light and dark | F-09 | PASS (28/28) |
| R-22 | The body map is keyboard-operable | F-01 | IMPLEMENTED (UNVERIFIED by an automated gate) |
| R-23 | Dark mode works by token, with no hand-switched colour | F-09 | PASS |

## 3. Automated test inventory

185 unit tests in 18 files at the start of 2026-11-01; **194 in 19 files** after the card-fidelity pass (`npm test`, 2026-11-01: **194 pass, 0 fail**), plus the red-team pack (**8 PASS, 0 FAIL, 0 NOT IMPLEMENTED**). Counts are per file, measured from the source.

| Test ID | File | Tests | Covers |
|---|---|---|---|
| `UT-schema` | `src/lib/schema.test.ts` | 2 | the strict five-field schema; the extra-key refusal; `FALLBACK_CARD` |
| `UT-cardFidelity` | `src/lib/cardFidelity.test.ts` | 11 | the card is derived, never replayed; no word the user did not type; all 14 regions reach the card; an empty session gives an empty card; the two boundary substitutions |
| `UT-cardFidelity.answers` | `src/lib/cardFidelity.answers.test.ts` | 16 | **CF-01..CF-20**: a submitted comparison and duration reach their own fields in either order; the comparison question's answer fills the metaphor row; a missing comparison stays empty; the whole path through the state machine; the "for" false positive fixed; filler filtered; the quoted sentence avoids the duration row |
| `UT-cardView` | `src/lib/cardView.test.ts` | 7 | five rows in schema order; verbatim display; the fallback on rejection; placeholders never shown as answers |
| `UT-crisis` | `src/lib/crisis.test.ts` | 7 | the lexicon, ordinary text, nothing to save, the four contacts, back navigation |
| `UT-deleteEverything` | `src/lib/deleteEverything.test.ts` | 8 | storage-then-rows order, partial failure, idempotence, retry, categories only |
| `UT-designTokens` | `src/lib/designTokens.test.ts` | 7 | every required contrast pair, both palettes, from the stylesheet's own values |
| `UT-interview` | `src/lib/interview.test.ts` | 12 | the bank is authoritative; sequence enforcement; crisis first; fallback; refusal logging |
| `UT-interviewFlow` | `src/lib/interviewFlow.test.ts` | 19 | request bodies, response parsing, the closed state set, progress numbering |
| `UT-models` | `src/lib/models.test.ts` | 15 | mode selection, the fixture adapter, fail-closed paths, the mock card is derived |
| `UT-patterns` | `src/lib/patterns.test.ts` | 17 | counts, weekdays, clusters, the closed vocabulary, the causal-phrase filter |
| `UT-questionBank` | `src/lib/questionBank.test.ts` | 5 | Q1..Q13 sequential, every question has text and texture, no provocation verb |
| `UT-regions` | `src/lib/regions.test.ts` | 13 | the 14 labels, fixed taps, disjointness, centres, purity, the per-view map space, A2/A3 |
| `UT-storageObjects` | `src/lib/storageObjects.test.ts` | 13 | prefix discipline, listing, verified emptiness, no silent no-op |
| `UT-supabaseTarget` | `src/lib/supabaseTarget.test.ts` | 20 | target resolution, mixed pairs, URL validation, refusal categories |
| `UT-tokenDiscipline` | `src/lib/tokenDiscipline.test.ts` | 7 | no raw palette colour, no hand-switched dark colour, one disclaimer component, every route through the shell |
| `RT-T3` (unit) | `tests/redteam/t3-extra-field.test.ts` | 5 | the migration's five content columns and nothing else |
| `RT-T6` (unit) | `tests/redteam/t6-bank-audit.test.ts` | 7 | the bank diff against Table 11, including reword/insert/remove/reorder |
| `RT-T1..T8` (rows) | `tests/redteam/run.ts` | 8 rows | crisis, advice injection, extra field, prompt injection, copy scan, bank audit, correlation audit, delete-all |


## 4. Visual harness gates and the recorded baseline

The harness (`tools/visual-harness/`) is not part of `npm test`, and it was **not modified** by any of
this work. Its last full run (2026-11-01, production build, 10 viewports, 4 alignment viewports)
recorded **216 gates: 176 PASS, 40 FAIL**, 12 screenshots, **0 console errors**. The same run before the
body-map fix recorded 160 PASS / 56 FAIL, so **16 gates moved from FAIL to PASS** with no gate changed.

| Gate | Result | Meaning for the MVP |
|---|---|---|
| `P0.server`, `P0.map` | PASS | the app serves and renders |
| `P1.line` (11), `P2.copy` (10) | PASS | the fixed line renders; no forbidden word is rendered |
| `L1.form` (8), `L3.tap` (8) | PASS | the figure draws; a tap names the right region |
| **`L2.overhang` (8), `L2.coverage` (8)** | **PASS** | every zone outline is on the body and every drawn part is tappable - the `ISS-06` fix |
| `S1.height`, `S2.uniform`, `S3.mapspace`, `S5.aspect` | PASS (4 / 10 / 10 / 4) | the map space is honest and undistorted |
| `C1..C7` (28) | PASS | contrast AA in both schemes, from rendered colours |
| `T3..T6` (40) | PASS | no scroll, overlap, clipping or overflow |
| `D3.focus` (3), `D4.noOcclusion` (10) | PASS | the fixed line never covers the focused field or a control |
| `J1..J4` (5) | PASS | the journey completes and the card carries the tapped region |
| **`D1.firstScreen`, `D2.scrolling`** | **FAIL 7/10 each** | the fixed line is below the fold on phones; the sticky fix was measured and failed `D4` — `ISS-07` |
| **`T1.zone44`, `T2.control44`** | **FAIL 10/10 each** | touch targets below 44 px; unreachable on a phone — `ISS-13` |
| `S4.side`, `N1.figure`, `N2.views` | FAIL 4 / 1 / 1 | the Side view and the figure variants are not built (Phase 2.2–2.4) — `ISS-09` |

**Baseline preserved.** The harness and its report format are unchanged; the numbers above are the
harness's own output, and the report is at `%TEMP%\somamap-phase2\somamap-phase2-report.json`.

## 5. The research blueprint, recorded as future candidates

`Finding the Words — Body-Symptom Vocabulary App Blueprint` (Z.ai, November 2026, 20 pages) proposes
fifteen features on a 90-day Phase-1 MVP far larger than this one. **None of them is in this MVP**
(see `MVP-SCOPE.md` §7). They are recorded here so the value is not lost, each with the compliance
question that must be answered before it could ever be built.

| ID | Candidate | Source | The question it raises |
|---|---|---|---|
| `RB-F1` | Interactive body map with ~36 zones, drag-to-shade, left/right toggle, radiation arrow | §3.2 | Already partly built as F-01. Drag-shading and a radiation arrow add nothing interpretable — **plausible later** |
| `RB-F2` | Tiered word bank (plain → MPQ-mapped clinical → granular) | §3.2 | A *menu* of words is not the user's own words. Iron rules 1 and 2 keep the card to what the user typed; a bank needs a decision about whether picked words count as theirs — **needs a compliance decision** |
| `RB-F3` | 0–10 severity slider (+ faces option) | §3.2 | **REJECTED for the MVP**: a number is a judgement about the user's sensation and invites triage |
| `RB-F3b` | PSFS-style personal goal ratings | §3.2 | **REJECTED for the MVP**: function ratings are a clinical instrument |
| `RB-F4` | Context tags (sleep, stress, food, movement, medication, cycle, weather) | §3.2 | **REJECTED for the MVP**: collects data for correlation, which iron rule 3 forbids |
| `RB-F5` | Adaptive word ordering | §3.3 | Needs per-user analytics of word use — a privacy surface with no MVP need |
| `RB-F6` | Word-a-day spaced repetition | §3.3 | Changes the product into a learning app; **plausible later**, no compliance issue |
| `RB-F7` | Voice memo with on-device extraction | §3.3 | **REJECTED for the MVP**: new data class, new provider, and "suggested descriptors" is model interpretation |
| `RB-F8` | Timeline journal with a severity heat layer | §3.4 | **REJECTED for the MVP**: persistence plus a severity display; iron rule 3 |
| `RB-F9` | Trend charts and co-occurrence statistics | §3.4 | **REJECTED for the MVP**: correlation is exactly what iron rule 3 forbids, however careful the wording |
| `RB-F10` | Flare detection against a personal baseline | §3.4 | **REJECTED for the MVP**: statistical cause attribution by another name |
| `RB-F11` | Treatment-response tracking | §3.4 | **REJECTED for the MVP**: implies a treatment relationship |
| `RB-F12` | One-page clinician visit-prep report | §3.5 | **REJECTED for the MVP**: makes the product an input to a clinical decision |
| `RB-F13` | Question queue for the next appointment | §3.5 | **Plausible later**: it is the user's own questions, uninterpreted. Still needs care not to become clinical preparation |
| `RB-F14` | Teach-back rehearsal with gap flagging | §3.5 | **REJECTED for the MVP**: "your story does not mention timing" is the app judging the user's description |
| `RB-guardrail` | Red-flag routing (crushing chest pressure with radiation; sudden worst-ever headache; new neurological symptoms → seek care) | §3.7 | **REJECTED — direct conflict with iron rule 4.** Symptom-based emergency routing is medical triage and is forbidden |

**What the research blueprint gets right, and is already in the product:** the vocabulary bottleneck
is real; a body map lets a person point instead of name; plain language before clinical language; and
"describe, never interpret" (its principle P4) is SomaMap's iron rule 1. Its own guardrail section
names interpretation as the line that would make a product a medical device — which is the line
`.clinerules` draws for us.


## 6. Evidence log

| Date | Evidence | Result |
|---|---|---|
| 2026-10-29 | `RT-T8` live delete-all run (Entry 23) | 11 assertions passed; rows and objects gone; the account intact |
| 2026-10-31 | `npm test` (unit suite + red-team pack) | 185/185 unit; 8 PASS / 0 FAIL / 0 NOT IMPLEMENTED |
| 2026-10-31 | `node tools/visual-harness/run.mjs --self-test` | 6/6 gate-mechanics cases pass |
| 2026-10-31 | `node tools/visual-harness/run.mjs` | 216 gates: 160 PASS, 56 FAIL; 12 screenshots; 0 console errors (Entry 48 §4) |
| 2026-11-01 | `node --test src/lib/cardFidelity.answers.test.ts` | 16/16 pass — CF-01..CF-20 (Entries 49, 50) |
| 2026-11-01 | `npm test` after the card-fidelity pass | **194/194 unit**, red-team 8 PASS / 0 FAIL / 0 NOT IMPLEMENTED |
| 2026-11-01 | `%TEMP%\somamap_iss01_probe.mjs` | **11/11** — `/` redirects to `/checkin` on the production build |
| 2026-11-01 | `%TEMP%\somamap_a11y_probe.mjs` | **13/13** — keyboard order, names, focus cues, structure, Enter selects a region, proportions |
| 2026-11-01 | `node tools/visual-harness/run.mjs` after the body-map fix | 216 gates: **176 PASS, 40 FAIL**, 0 console errors; `L2.overhang` 8/8 and `L2.coverage` 8/8 now PASS |
| 2026-11-01 | the sticky-disclaimer experiment | `D1` 10/10, `D2` 10/10, `D3` 3/3 PASS but `D4` **FAIL 7/10** (covers the description field) — reverted, `ISS-07` recorded |
| 2026-11-01 | Repository inspection (this document) | `ISS-01`..`ISS-05` resolved; `ISS-06` partially resolved; `ISS-07` and `ISS-13` open with proofs |

## 7. Change control

1. Every MVP change updates **this file** in the same piece of work: the feature's status, the
   evidence row, and any new `ISS-nn`.
2. An `ISS-nn` closes only when its fix has its own evidence row and the affected UAT case has been
   re-run.
3. IDs are never reused and never renumbered. A superseded requirement becomes `R-nn (withdrawn)`.
4. This document never overrides `.clinerules`, the build blueprint, or the market validation report.
5. `BUILD-REPORT.md` is appended to, never rewritten; each entry cites the IDs it affects.

