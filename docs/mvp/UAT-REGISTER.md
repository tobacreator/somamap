# SomaMap — UAT Register

**Purpose:** the user-acceptance scenarios for the MVP, with the expected result derived from an
**inspection of the application as it is today** (not from an intention), and the actual result
recorded wherever it has been executed. Written 2026-11-01.

**Status vocabulary** (same as `MVP-TRACEABILITY.md`): `PASS` (executed with a quoted result),
`FAIL`, `NOT RUN` (needs a human, a device, or an environment that is not available), `BLOCKED`
(cannot be run until an issue is fixed).

**Important:** a `PASS` here means the *machine-checkable* half has been observed. The
human-judgement half of every scenario (does it feel calm, is it obvious what to do) is `NOT RUN`
until a person has actually walked it, and is recorded as such.

---

## 0. Environment and how to run these

```powershell
npm run build
npx next start -p 3311            # production build, the configuration the harness uses
# or, for a live-reloading walk-through:
npm run dev
```

- Entry point for every scenario: `http://127.0.0.1:3311/checkin` (see `UAT-19` for the root route).
- The body-map scenarios (`UAT-02`, `UAT-03`, `UAT-14`) have machine equivalents in the visual
  harness (`tools/visual-harness/run.mjs`); the harness drives the production build in a real Chrome
  at 320×568, 390×844 and 1440×900, in both colour schemes.
- `UAT-16` needs a running Supabase and a signed-in session; it cannot be judged in a session with
  no stack.
- Nothing in any scenario writes to a database. The check-in path persists nothing by design.

---

## 1. The fifteen scenarios

### UAT-01 · Complete user journey (end to end)

| | |
|---|---|
| **Area** | The whole promise |
| **Preconditions** | The app is running; no session needed |
| **Steps** | 1. Open `/checkin`. 2. Tap a region (say, the chest). 3. Type a few words, or leave it blank. 4. Press Continue. 5. Answer three questions. 6. Look at the card |
| **Expected (from inspection)** | The prompt "Where do you feel it?" is on screen; the tap produces `Region: chest`; Continue reaches the interview; the interview asks exactly three questions, one at a time, with a progress line; the third answer produces a card headed "Your card" with five labelled rows and the fixed line below them |
| **Actual** | Machine-verified end to end on the production build (harness journey, 2026-10-31): card reached, five field labels rendered, the region `chest` on the card, the fixed line present, and the region carried on all four requests. Screenshots: `p2-390-light-card.png`, `p2-390x844-light.png`. A human walk-through is **NOT RUN** |
| **Status** | `PASS` (machine) / `NOT RUN` (human) |
| **Evidence** | `VH-J1.card`, `VH-J2.region`, `VH-J3.fields`, `VH-J4.regionSent`; Entry 48 §4 |

### UAT-02 · Body map names a region (front view)

| | |
|---|---|
| **Area** | Body-map interaction |
| **Steps** | Tap the head, then the chest, then a thigh |
| **Expected** | Each tap names the region it landed in, from the fixed map: `Region: head`, `Region: chest`, `Region: thighs`. Exactly one zone is highlighted, the pin marks the tap, and the readout is announced (`aria-live="polite"`) |
| **Actual** | Machine-verified: 7 zones tapped in the front view at 320×568, 390×844 and 1440×900, every one naming its own region, one pressed zone, the pin inside it. The three Chapter 4.4 fixed coordinates are pinned by unit test |
| **Status** | `PASS` (machine) / `NOT RUN` (human) |
| **Evidence** | `VH-L3.tap` (8/8), `UT-regions` "maps three fixed coordinates to the same three labels on every call" |

### UAT-03 · Body map names its own regions (back view)

| | |
|---|---|
| **Area** | Body-map interaction |
| **Steps** | Switch to Back, then tap the upper back, an arm, a knee |
| **Expected** | The back view names `upper back`, `arms`, `knees`; switching view clears the previous selection, because the two views name different regions |
| **Actual** | Machine-verified: 7 zones tapped in the back view at every tested viewport, all correct; the unit tests pin the same coordinates |
| **Status** | `PASS` (machine) / `NOT RUN` (human) |
| **Evidence** | `VH-L3.tap` (8/8), `UT-regions` "names the back view's own regions at the same coordinates" |

### UAT-04 · The description field is optional

| | |
|---|---|
| **Area** | Complete journey |
| **Steps** | Tap a region, leave the description box empty, press Continue |
| **Expected** | The field is labelled "Anything you want to put into words", has no `required` marker, and its placeholder says "Type a few words, or leave it blank." Continuing with it empty reaches the interview |
| **Actual** | The field's optionality is machine-verified (no `required`, the placeholder text). Continuing with an **empty** field has **NOT RUN** — the harness always types text before continuing, and no unit test covers the empty-box transition end to end |
| **Status** | `PARTIAL` (optionality confirmed; the empty-box transition `NOT RUN`) |
| **Evidence** | `VH-N3.optional` |

### UAT-05 · The interview asks three approved questions

| | |
|---|---|
| **Area** | Interview |
| **Steps** | Reach the interview and answer three questions |
| **Expected** | Exactly three questions, one at a time. In the shipped mock configuration the three are Q1 ("Does it stay in one spot, or does it spread out?"), Q4 ("If it had a texture - smooth, rough, tight, or loose - which would it be?") and **Q14 ("What does it remind you of?")**, the owner-approved comparison question. Progress reads "Question 1 of 3", then 2, then 3. The wording comes from the bank, never from a model |
| **Actual** | Machine-verified: the sequence is the fixture's `["Q1","Q4","Q14"]`; the wording is looked up in the bank on every turn; a session that sends a further answer is refused. `CF-08` pins the three ids and Q14's exact wording; the red-team `T4` evidence line reports `Q1 -> Q4 -> Q14` |
| **Status** | `PASS` (machine) / `NOT RUN` (human) |
| **Evidence** | `UT-interview` (12), `UT-interviewFlow` (19), `CF-08`; `npm test` 2026-11-01 |

### UAT-06 · No question asks a clinical provocation

| | |
|---|---|
| **Area** | Interview / compliance |
| **Steps** | Read every question the bank can ask |
| **Expected** | No question asks whether it changes when you breathe, move or eat; whether it radiates; whether you have had it before. No question names a cause, a body system, or a condition |
| **Actual** | Machine-verified: the bank audit diffs all 13 questions against Table 11 and finds no provocation verb; the causal-phrase filter and the condition-name sample are checked in the correlation audit |
| **Status** | `PASS` (machine) |
| **Evidence** | `RT-T6` (PASS), `UT-questionBank` "carries no provocation verb" |

### UAT-07 · Card fidelity: every value traces to the user

| | |
|---|---|
| **Area** | Card fidelity |
| **Steps** | Complete a session, then compare each card row with what was typed or tapped |
| **Expected** | `Where` is the tapped region, from the fixed map. `Words you chose` holds words the user typed (max 5, filler filtered out). `It feels like` holds the user's own comparison verbatim, or "Not answered yet". `How long` holds the user's own time phrase verbatim, or "Not answered yet". `In your words` quotes one of the user's answers exactly, and does not repeat the duration row. No row contains a word the user did not type |
| **Actual** | Machine-verified in 16 controlled cases: a submitted comparison reaches `intensity_metaphor` and a submitted duration reaches `duration`, in either order, with no swap (`CF-01`..`CF-04`, `CF-07`); the comparison question's own answer fills the row when the user did not phrase a comparison (`CF-16`); a missing comparison stays empty (`CF-18`); a bare "for" is no longer a duration (`CF-09`); filler is filtered (`CF-10`); the quoted sentence avoids the duration row (`CF-19`) |
| **Status** | `PASS` (machine) / `NOT RUN` (human). The four defects found on 2026-11-01 (`ISS-02`..`ISS-05`) are **resolved** |
| **Evidence** | `node --test src/lib/cardFidelity.answers.test.ts` 2026-11-01: 16/16 pass; `npm test`: 194/194 unit, red team 8/8 |

### UAT-08 · Crisis handling stops the loop

| | |
|---|---|
| **Area** | Crisis handling |
| **Steps** | On the check-in screen, type an explicit crisis phrase (the lexicon includes "want to die", "kill myself", "suicidal" and others) and press Continue |
| **Expected** | The whole flow is replaced by the static crisis screen: United States — Call or text 988; United Kingdom — Call 116 123; Nigeria and the EU — Call 112; Anywhere else — findahelpline.com; the line "Nothing you typed was saved. These people can help right now."; and "Back to check-in". The phrase the user typed is **not** repeated anywhere |
| **Actual** | Machine-verified: all 24 lexicon phrases stop the loop whatever the case or punctuation; 10 non-trigger controls keep the loop; the crisis state carries no card and nothing to save; the screen shows the four contacts and nothing invented |
| **Status** | `PASS` (machine) / `NOT RUN` (human) |
| **Evidence** | `UT-crisis` (7), `RT-T1` (PASS 2026-10-31); a crisis screenshot was inspected in Entry 45 |

### UAT-09 · Crisis handling saves nothing and returns clean

| | |
|---|---|
| **Area** | Crisis handling / privacy |
| **Steps** | Trigger the crisis screen, then press "Back to check-in" |
| **Expected** | Nothing was written anywhere (no row, no object, no session). Back returns to a check-in screen with an empty description box and no region selected |
| **Actual** | Machine-verified: the crisis state carries no card and no session material; "returns to an empty check-in on back navigation" is asserted by unit test; `RT-T1` records that the loop stops with nothing to save |
| **Status** | `PASS` (machine) / `NOT RUN` (human) |
| **Evidence** | `UT-crisis` "hands the caller nothing to save and no card to render", "returns to an empty check-in on back navigation" |


### UAT-10 · Missing answers are shown as missing

| | |
|---|---|
| **Area** | Missing answers |
| **Steps** | Complete a session with plain answers that contain no comparison and no time phrase |
| **Expected** | The `It feels like` and `How long` rows read **"Not answered yet"**. No placeholder, no invented text, no plausible guess |
| **Actual** | Machine-verified: an answer with no comparison leaves `intensity_metaphor` empty and renders "Not answered yet"; an answer with no time phrase leaves `duration` empty and renders the same. The session now *asks* for a comparison (Q14), so the metaphor row fills whenever the user answers it - and stays honestly empty when they answer it with something that is not a comparison, or not at all |
| **Status** | `PASS` (machine) / `NOT RUN` (human) |
| **Evidence** | `CF-05`, `CF-06`, `CF-09d`, `CF-18`; `UT-cardView` "never displays a placeholder as an answer" |

### UAT-11 · The user's words are shown verbatim

| | |
|---|---|
| **Area** | Card fidelity |
| **Steps** | Type an unusual sentence with odd capitalisation or punctuation and complete the session |
| **Expected** | The sentence appears on the card exactly as typed — not reworded, not tidied, not shortened |
| **Actual** | Machine-verified: the card view displays field text verbatim and has a test named for exactly this; the fidelity module copies answers rather than composing them |
| **Status** | `PASS` (machine) |
| **Evidence** | `UT-cardView` "displays the user's own words as written, without rewriting them"; `CF-01`/`CF-02` (verbatim equality) |

### UAT-12 · Responsive behaviour at phone width

| | |
|---|---|
| **Area** | Responsive behaviour |
| **Steps** | Open `/checkin` at 320×568, then 390×844, then a desktop width |
| **Expected** | One column; nothing scrolls sideways; no control overlaps another; no text is clipped; the figure is fully visible; the description field and Continue are reachable |
| **Actual** | Machine-verified at 10 viewports (320×568, 320×800, 360×640, 390×844, 430×932, 768×1024, 1440×900, light and dark): no horizontal scrolling, no overlapping controls, no clipped text, nothing past the right edge — 40/40 gates PASS. **However** the fixed line is below the fold on every phone width (`ISS-07`), and the smallest zone is 18.2×23.8 px (`ISS-06`) |
| **Status** | `PASS` for layout integrity / `FAIL` for the fixed line's visibility and touch-target size |
| **Evidence** | `VH-T3..T6` (40/40 PASS), `VH-D1/D2` (7/10 FAIL), `VH-T1` (10/10 FAIL); screenshots `p2-320x568-light.png` … `p2-1440x900-dark.png` |

### UAT-13 · Copy discipline

| | |
|---|---|
| **Area** | Copy discipline |
| **Steps** | Visit every screen and read the copy; search the rendered text for the four forbidden words |
| **Expected** | The fixed line — "SomaMap is a vocabulary and journaling tool. It does not interpret sensations or give medical advice." — appears on every screen. The words `symptom`, `diagnosis`, `treatment` and `indicates` appear nowhere. The word is always "sensation" |
| **Actual** | Machine-verified: the fixed line renders on 11 screens/paths; no prohibited stem appears in rendered text at any of the 10 viewports; the copy scan reads 58 text files under `src/app`, `src/components` and `src/lib` with zero hits; the line is rendered from exactly one component |
| **Status** | `PASS` (machine) |
| **Evidence** | `VH-P1.line` (11/11), `VH-P2.copy` (10/10), `RT-T5` (PASS), `UT-tokenDiscipline` "renders the fixed line from exactly one component" |

### UAT-14 · Accessibility

| | |
|---|---|
| **Area** | Accessibility |
| **Steps** | 1. Tab through the check-in screen. 2. Select a region with the keyboard. 3. Try to tap the smallest region (the neck) on a phone. 4. Check contrast in light and dark |
| **Expected** | Every control is reachable and operable by keyboard with a visible focus cue; every interactive target is at least 44×44 px; text and controls meet WCAG AA contrast in both schemes; the readout is announced politely |
| **Actual** | Contrast **PASS** (28/28 gates, both schemes, from rendered colours). Keyboard reachability is now **measured** (`%TEMP%\somamap_a11y_probe.mjs`, **13/13 PASS**): 11 tab stops in a sensible order - `Front → Back → Region head → Region neck → Region shoulder → Region chest → Region abdomen → Region thighs → Region shins → the description field → Continue`; every control has an accessible name and a visible focus cue; Enter on a focused region selects it (`Region: head`, one zone pressed); the map is a labelled group of seven named, focusable buttons with a pressed state; the decorative figure is hidden from assistive technology; the readout is `aria-live="polite"`. Touch targets **FAIL** (`T1.zone44` and `T2.control44` 10/10 viewports) - see `ISS-13`. A screen-reader pass has **NOT RUN** |
| **Status** | `PARTIAL`: contrast PASS; keyboard PASS (machine); screen reader `NOT RUN`; touch targets `FAIL` (`ISS-13`) |
| **Evidence** | `VH-C1..C7` (28/28 PASS), `VH-T1`/`VH-T2` (FAIL), the a11y probe 13/13 |

### UAT-15 · Nothing is persisted by the check-in path

| | |
|---|---|
| **Area** | Privacy |
| **Steps** | Complete a check-in and an interview; then inspect the database and storage for any new row or object |
| **Expected** | No row, no object, no session record. The screens say so: "Your words stay on this screen. Nothing is saved yet." and the same for the interview |
| **Actual** | Machine-verified by design and by test: the interview route performs no database write (its own header records that authentication and the write belong to later work); the crisis path records nothing; the only server-side record is a *refusal* category (key names, question ids, mode) and it contains no content. An end-to-end database inspection after a real check-in has **NOT RUN** in this environment |
| **Status** | `PASS` (by construction and by the refusal-logging tests) / `NOT RUN` (the database inspection) |
| **Evidence** | `UT-models` "records categories only: never the answer text, never the refused values"; `UT-interview` "records nothing when a session runs clean" |


---

## 2. The scenarios the architecture requires (beyond the fifteen)

### UAT-16 · Privacy control: delete everything

| | |
|---|---|
| **Area** | Privacy |
| **Preconditions** | A running Supabase, a signed-in session, and at least one row to delete |
| **Steps** | Sign in at `/sign-in`; open `/settings`; read the target line; press "Delete everything"; confirm with "I understand - delete everything" |
| **Expected** | Settings says which project it will act on ("Target: your local project" / "the hosted project" plus the host). The action is two-step. On success: "Everything was removed. Your account is still here." and the sign-in still works. On a partial failure: "Some of it could not be removed, and nothing else was touched. Try again." and the rows are left alone. If the configuration is unusable the switch is **disabled** with a reason |
| **Actual** | Machine-verified by unit tests (8 for the action, 13 for storage, 20 for target resolution) and by a **live run recorded 2026-10-29**: 11 assertions passed, including rows and objects gone, the prefix independently verified empty, the account still able to sign in, and the other account untouched. A human run in this environment is **NOT RUN** |
| **Status** | `PASS` (machine + the recorded live run) / `NOT RUN` (human, this environment) |
| **Evidence** | `RT-T8` (PASS), `UT-deleteEverything`, `UT-storageObjects`, `UT-supabaseTarget`; Entry 23 |

### UAT-17 · The API contract refuses what it does not understand

| | |
|---|---|
| **Area** | Interview / contract |
| **Steps** | `POST /api/interview` with: no body; a body that is not an object; answers that do not match the questions asked; more answers than the session allows; a fourth answer after three; an unknown question id |
| **Expected** | `400 { "error": "invalid request" }` — no reason string, no echo of the input, nothing learned about the machine. An unknown question id in a *draft* falls back to the bank's first question rather than erroring |
| **Actual** | Machine-verified: 11 unexpected request shapes refused; answers that do not match the questions asked refused; a further answer refused; an unknown id falls back to Q1 |
| **Status** | `PASS` (machine) |
| **Evidence** | `RT-T4` (PASS), `UT-interview` "refuses unexpected request shapes", "refuses answers that do not match the questions asked" |

### UAT-18 · Dark mode

| | |
|---|---|
| **Area** | Responsive / accessibility |
| **Steps** | Set the OS or browser to dark and repeat the journey |
| **Expected** | The palette switches by token with no hand-switched colour; contrast still meets AA; the fixed line, the readout, the zones and the pin all remain legible |
| **Actual** | Machine-verified at every tested viewport in dark mode: all 14 contrast gates pass (outline 3.85:1, selected fill 7.21:1, accent text 8.88:1, body text 16.60:1, muted 8.03:1, pin 16.60:1); no hand-switched colour exists (`UT-tokenDiscipline`). Screenshots: `p2-390x844-dark.png`, `p2-1440x900-dark.png` |
| **Status** | `PASS` (machine) |
| **Evidence** | `VH-C1..C7` in dark, `UT-designTokens`, `UT-tokenDiscipline` |

### UAT-19 · The entry point shows SomaMap, not a framework scaffold

| | |
|---|---|
| **Area** | Complete journey |
| **Steps** | Open `/` |
| **Expected** | A visitor arriving at the root lands in SomaMap - the check-in screen, with the fixed line |
| **Actual** | **PASSES.** `/` is a server redirect to `/checkin` (307). Verified on a production build in a real browser: `location.pathname === "/checkin"`, the body map is present, the fixed line is on the destination, no scaffold text anywhere, no console errors, and `/checkin`, `/sign-in`, `/settings` all still answer 200. 11/11 probe checks pass |
| **Status** | `PASS` (machine) / `NOT RUN` (human) - `ISS-01` **resolved** |
| **Evidence** | `%TEMP%\somamap_iss01_probe.mjs`, 11/11; `src/app/page.tsx` |

### UAT-20 · The crisis screen is numbers, and there is no symptom-based routing

| | |
|---|---|
| **Area** | Crisis handling / compliance |
| **Steps** | 1. Confirm the four contacts. 2. Try to find any symptom-based emergency rule |
| **Expected** | Exactly four contacts, the blueprint's own. **No** rule anywhere that routes a user to care because of a *sensation* (for example chest plus arm, or a sudden worst-ever headache) — that would be medical triage and is forbidden |
| **Actual** | Machine-verified: the four contacts are verbatim and complete; the crisis trigger is the language lexicon alone; the harness's journey walks the ordinary path and asserts nothing about a sensation; no symptom-based rule exists in the codebase. The research blueprint *proposes* such a rule (`RB-guardrail`); it is recorded as **REJECTED** |
| **Status** | `PASS` (machine) |
| **Evidence** | `UT-crisis` "shows the blueprint's contact details and nothing invented"; `RT-T1`; `MVP-TRACEABILITY.md` §5 `RB-guardrail` |

---

## 3. Summary — after the 2026-11-01 implementation pass

| Status | Cases |
|---|---|
| `PASS` (machine-verified) | UAT-01*, UAT-02*, UAT-03*, UAT-05*, UAT-06, UAT-07*, UAT-08*, UAT-09*, UAT-10*, UAT-11, UAT-13, UAT-16, UAT-17, UAT-18, **UAT-19***, UAT-20 |
| `PARTIAL` | UAT-04 (the empty-box transition is `NOT RUN`), UAT-12 (layout PASS; the fixed line is below the fold on phones), UAT-14 (contrast and keyboard PASS; screen reader `NOT RUN`; touch targets FAIL), UAT-15 (by construction; the database inspection is `NOT RUN`) |
| `DEFECT` | none outstanding on the journey - `ISS-02`..`ISS-05` are resolved |
| `BLOCKED` | none |
| `NOT RUN` (human half) | every scenario marked `*`, plus UAT-16 in this environment |

**No scenario is marked `PASS` on the human half.** The machine half is evidenced; the judgement half
needs a person, a phone, and twenty minutes.

---

## 4. The human walkthrough (about 20 minutes)

Everything below is machine-verified already; this is the part a person must do, in order, on a phone
or a phone-sized browser window (390×844 is the design target). Tick each line, then sign §5.

**Setup.** `npm run build`, then `npx next start -p 3311`, and open `http://127.0.0.1:3311/` (note: the
*root*, to check the redirect for yourself).

| # | Do this | You should see | UAT |
|---|---|---|---|
| 1 | Open `/` | You land on the check-in screen. No "edit page.tsx", no Vercel advert | UAT-19 |
| 2 | Tap the head, then the chest, then a thigh | The readout names each one; a pin marks the tap; one region is highlighted | UAT-02 |
| 3 | Switch to Back, then tap the upper back, an arm, a knee | The back view names its own regions; the previous selection clears | UAT-03 |
| 4 | Leave the description box empty and press Continue | The interview starts anyway | UAT-04 |
| 5 | Answer the three questions in your own words | Three questions, one at a time, from the bank: spot/spread, texture, "What does it remind you of?" Progress reads "Question 1 of 3" | UAT-05, UAT-06 |
| 6 | On the card, compare every row with what you typed | Each row is your own words or "Not answered yet". Nothing you did not type | UAT-07, UAT-11 |
| 7 | Try an answer with no comparison, and one with no time phrase | Those rows read "Not answered yet" - not a guess | UAT-10 |
| 8 | Start again, type "I want to die", press Continue | The static crisis screen with the four contacts. Nothing you typed is repeated. "Back to check-in" returns to an empty check-in | UAT-08, UAT-09 |
| 9 | Read every screen you have visited | The fixed line is on each one. (On a phone you will need one swipe to reach it - that is `ISS-07`, recorded) | UAT-13 |
| 10 | Set your phone or browser to dark and repeat steps 2-6 | Everything stays legible | UAT-18 |
| 11 | Put the phone down and do steps 2-6 with a keyboard only: Tab, Enter | Every control takes focus with a visible cue; Enter selects a region | UAT-14 |
| 12 | Try to tap the neck on a phone | It works, but the target is small (about 18px wide). This is `ISS-13`, recorded and unfixable without changing the anatomy | UAT-14 |
| 13 | Rotate to landscape, then a tablet, then a desktop window | No sideways scrolling, nothing clipped or overlapping, the figure keeps its proportions | UAT-12 |
| 14 | Sign in at `/sign-in`, open `/settings`, read the target line, then "Delete everything" and confirm | It says which project it will act on; two-step; "Everything was removed. Your account is still here."; you can sign in again | UAT-16 |
| 15 | Start a check-in, trigger the crisis screen, and confirm nothing was saved | No row, no object, no session | UAT-15 |

**What is deliberately not in the walkthrough:** the Side view and the figure variants (not built),
and any screen-reader pass (needs a screen reader and a person who uses one).

---

## 5. Sign-off

| Role | Name | Date | Verdict |
|---|---|---|---|
| Owner / product | _(to be signed)_ | | |
| Reviewer / compliance | _(to be signed)_ | | |

A scenario is signed off only when it has been walked on a phone-sized window and its result written
into this table. The machine evidence in this document is necessary but not sufficient.

