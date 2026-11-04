# SomaMap — Issues and Blockers

**Purpose:** every known defect, gap and blocker that stands between the current build and a
successful MVP demonstration, with the evidence, the impact, and the decision each one needs.
Written 2026-11-01 for a submission deadline of approximately three days.

**Priority vocabulary.** `P0` = the demonstration cannot happen. `P1` = the demonstration can happen
but will show something wrong or embarrassing. `P2` = worth fixing if the three days allow. `P3` =
recorded, no action planned. *This is issue triage for release management. It is not a product
severity feature: no severity, score or rating is collected from or shown to a user — that would
contradict iron rule 1 and is explicitly excluded in `MVP-SCOPE.md` §7.*

**Nothing here has been fixed yet.** Each item records a proposed fix and what it would cost, so the
owner can decide in one pass.

---

## 1. Summary

| ID | Pri | Title | Blocks | Status |
|---|---|---|---|---|
| `ISS-01` | **P0** | The root route still rendered the Next.js scaffold | A demo at `/` | **RESOLVED 2026-11-01** — `/` redirects to `/checkin`; 11/11 verification checks pass |
| `ISS-02` | **P1** | The session never asks for a comparison or a duration, so two card rows were empty | Card credibility in the demo | **RESOLVED 2026-11-01** — the owner-approved comparison question (Q14) is asked; the metaphor row now fills |
| `ISS-03` | **P1** | The duration locator treated the bare preposition "for" as a duration | Card correctness | **RESOLVED 2026-11-01** — "for" removed; regression cases added |
| `ISS-04` | P2 | `quality_words` could hold words that are not qualities | Polish | **RESOLVED 2026-11-01** — a filler filter; descriptions still pass through |
| `ISS-05` | P2 | `user_own_sentence` could repeat the `duration` row verbatim | Polish | **RESOLVED 2026-11-01** — the quoted sentence avoids the duration row |
| `ISS-06` | **P1** | The body map was visually unfinished: alignment, coverage and touch targets | The visual half of the demo | **PARTIALLY RESOLVED 2026-11-01** — `L2.overhang` and `L2.coverage` now PASS 8/8 each; the touch-target half is split out as `ISS-13` |
| `ISS-07` | **P1** | The fixed line is below the fold on every phone width | The compliance line's visibility | **OPEN — measured, not resolvable.** The sticky fix was built and failed `D4`; the in-flow fallback stands. See §3 |
| `ISS-08` | P2 | Sign-in and delete-everything need a running Supabase | Demoing the privacy control | Open (environmental) |
| `ISS-09` | P2 | The Side view and the figure variants are not built | Nothing in the MVP | Planned (Phase 2.3–2.4) |
| `ISS-10` | — | The research blueprint proposes symptom-based red-flag routing | — | **REJECTED** (iron rule 4) |
| `ISS-11` | P3 | The question bank's count is twelve in prose and thirteen in the table | Nothing | Open, decision needed |
| `ISS-12` | P3 | Deleting `.next` while a dev server runs stops that server | Nothing | Documented, avoid |
| `ISS-13` | **P1** | No zone can be 44x44 px on a phone: the neck is 7.6% of the figure's width | Touch-target criterion | **OPEN — proven impossible.** See §4 |
| `ISS-23` | **P1** | The vocabulary helper showed one list on every question, and the words of "I don't know" were shown as chosen vocabulary | Card credibility, and whether the helper helps at all | **RESOLVED 2026-11-04** — the group follows the question; the comparison question offers the bank's own phrases; the words of not knowing leave `quality_words` |
| `ISS-24` | **P1** | Editing the answers or changing the region saved a **second** journal entry for one check-in (four rows for one check-in were measured) | The journal's credibility: the count is the product's only history | **RESOLVED 2026-11-04** — a rebuild updates the card and its session in place; the ids travel with the session that survives the remount; a new check-in still inserts |

---

## 2. The blockers in detail

### ISS-01 · P0 · The root route still renders the Next.js scaffold

- **Evidence.** `src/app/page.tsx` read 2026-11-01: the file is the untouched `create-next-app`
  scaffold — "To get started, edit `page.tsx` file.", the Next.js and Vercel logos, and links to
  `vercel.com/new` and `nextjs.org/docs`. It is the only route that does not render through the
  `Screen` shell, so it also carries **no fixed line**.
- **Impact.** Anyone who opens the local or deployed root URL sees a framework advert, not SomaMap.
  For a submission this is the first impression, and it is also the one screen in the product that
  breaks iron rule 5's "every screen shows the fixed line".
- **Proposed fix.** Replace `/` with a minimal entry screen: the product's own H1 and subhead (both
  already approved in the market validation report and already used in `layout.tsx` metadata), one
  line of what SomaMap is, a link into `/checkin`, and the fixed line — rendered through `Screen`,
  which brings the line with it. No new claims, no new vocabulary, no marketing promises.
- **Cost / risk.** Under an hour. Low risk: one file, one route. It also brings `/` inside
  `UT-tokenDiscipline`'s "every route through the shell" rule, which currently excludes it.
- **Decision needed.** Approve the copy for the entry screen (or say "leave it").

### ISS-02 · P1 · The session never asks for a comparison or a duration

- **Evidence.** The mock session asks **Q1, Q4, Q12** (spot/spread, texture, change over the session)
  — verified by probe and pinned by `CF-08`. None of the three asks "what is it like" or "how long".
  A plain three-answer session therefore produces a card whose `duration` row is empty, and usually
  `intensity_metaphor` too, both rendering "Not answered yet" (measured: `CF-08`).
- **Impact.** The card is the product's output, and in the demo **two of its five rows will read
  "Not answered yet"** unless the presenter volunteers a comparison and a time phrase in their
  answers. That is honest — iron rule 1 forbids inventing them — but it makes the product look thin
  at exactly the moment it is being judged.
- **What must NOT be done.** Do not fill the fields with a guess. Do not add a card field. Do not
  loosen the fidelity rules. The five-field schema and the "empty when the user said nothing" rule
  are non-negotiable (`MVP-SCOPE.md` §5, N-9).
- **Options.** (a) **Do nothing and script the demo** — the presenter types an answer containing
  "like …" and one containing "for three days", and says out loud that the card shows only what the
  person said. Zero code risk. (b) **Change the mock question sequence** to include Q5 (object
  metaphor) and Q3 or Q8 (which invite a time phrase). A one-line change to
  `modal/fixtures/interview.json` — but Q5 does not itself force the word "like", so it improves the
  odds rather than guaranteeing the row. (c) **Review a question that asks how long the sensation has
  been there** — this needs a bank change, which is a copy review, and the bank is diffed against
  Table 11 by `RT-T6`, so it would need an approved addition.
- **Recommendation.** (a) for the demo, plus (b) if the owner wants the card fuller by default. (c)
  only with an explicit copy decision, because it changes an approved artefact.
- **Decision needed.** Which option.

### ISS-03 · P1 · The duration locator treats the bare preposition "for" as a duration

- **Evidence.** `TIME_WORDS` in `src/lib/cardFidelity.ts` contains `"for"`, matched as a whole word.
  Measured on the real path (`CF-09`): all three of these land in the card's **`How long`** row —
  "I have been waiting for it to pass.", "I am looking for a word for it.", "It hurts when I reach
  for things." None of them says how long.
- **Impact.** The card can present a phrase with no time content as the answer to "How long". The
  words are the user's own, so fidelity holds, but the *row* is wrong — and it is the kind of thing a
  reviewer notices immediately. One word causes it; the effect is visible on the product's output.
- **Proposed fix.** Two candidate shapes, both small:
  1. Drop the bare preposition `"for"` from `TIME_WORDS` and require a time unit instead (the list
     already has `minute(s)`, `hour(s)`, `day(s)`, `week(s)`, `month(s)`, `morning`, `evening`,
     `night`, `today`, `yesterday`, `lately`, `recently`, `since`, `always`, `on and off`). "For about
     three days" still works through `"days"`; the three false positives above stop.
  2. Keep `"for"` but require a time unit inside the same phrase.
- **Cost / risk.** Option 1 is a one-line change plus one line in `CF-09` (which currently
  *characterises* the defect and would become an assertion that it is gone). Risk is low but must be
  measured: `UT-cardFidelity`, `UT-cardFidelity.answers` and `UT-models` must still pass.
- **Decision needed.** Approve the fix. It is a behaviour change, so it needs a report entry and a
  re-run of the affected tests — not a silent edit.

### ISS-04 · P2 · `quality_words` can hold words that are not qualities

- **Evidence.** Measured (`CF-10`): "It stays in one spot." produces `["stays", "one", "spot"]` for
  the row labelled **"Words you chose"**. Across the probe's other sessions the row also picked up
  "spreads", "across", "upper", "back", "feels", "three", "weeks".
- **Impact.** Fidelity holds — every word was typed by the user — but the row reads oddly, and the
  label implies the user chose them as quality words.
- **Proposed fix.** A decision, not necessarily code: rename the label (a copy change needing review),
  extend the stop-list, or accept it. Extending the stop-list is a data change with a long tail and no
  natural end; renaming is one string.
- **Cost / risk.** Renaming touches approved copy and `UT-cardView`'s label expectations. Low risk,
  but it needs a copy decision.
- **Decision needed.** Rename, extend, or accept.

### ISS-05 · P2 · `user_own_sentence` can repeat the `duration` row verbatim

- **Evidence.** Measured: in a session where the duration sentence is the longest answer, the card
  shows the same sentence twice — once as `How long`, once as `In your words` (probe cases B and E).
- **Impact.** Cosmetic: two of five rows can carry identical text. Nothing is invented; both are the
  user's own words.
- **Proposed fix.** None proposed for the MVP. If it matters, the longest answer *excluding* the one
  already used as the duration could be chosen — a small change to `userOwnFields`, but it changes
  which of the user's sentences is quoted, so it needs a decision.
- **Decision needed.** Accept for the MVP, or pick the second-longest.


### ISS-06 · P1 · The body map is visually unfinished

- **Evidence.** Harness run 2026-10-31 (Entry 48): `L2.overhang` 8/8 FAIL, `L2.coverage` 8/8 FAIL,
  `T1.zone44` 10/10 FAIL, `T2.control44` 10/10 FAIL. The figure is a blocky eleven-rectangle
  mannequin; the smallest zone (the neck) is 18.2×23.8 px; the front view draws arms and hands that
  cannot be tapped, and the back view draws a head, a neck, thighs and shins that cannot be tapped.
  The shoulder zone's top edge sits 16 px off the drawn torso, the hips zone 17 px, and the feet zone
  31 px.
- **Impact.** This is the *visible* half of the product. It breaks no rule and blocks no journey, but
  it is what a reviewer judges first, and touch targets under 44 px are an accessibility defect, not
  only a cosmetic one.
- **Proposed fix.** Phase 2.2–2.4 of the approved plan (`docs/PHASE-2-PLAN.md`): redraw the neutral
  Front and Back silhouettes so the drawn shape and the zone geometry agree, resolve the untappable
  areas, add height-driven sizing to lift the touch targets, then the Side view, then the variants.
  The gates already exist and already report exactly what is wrong.
- **Cost / risk.** The largest remaining piece of work — hours, not minutes, and the one item where
  the deadline is genuinely tight. It is **not** required for a functional demonstration; the journey
  passes today.
- **Decision needed.** Whether to spend the remaining time here or to demo the journey as it is.

### ISS-07 · P1 · The fixed line is below the fold on every phone width

- **Evidence.** Harness run 2026-10-31: `D1.firstScreen` FAIL 7/10, `D2.scrolling` FAIL 7/10. At
  320×568 the footer's top is at y=1068 in a 568 px viewport; the line is visible only after
  scrolling, and it passes only at 768×1024 and 1440×900, where the page happens to fit.
- **Impact.** Iron rule 5 requires the line on every screen; it *renders* on every screen and the copy
  scan confirms it. What fails is that a phone user does not **see** it without scrolling. That is a
  presentation defect with a compliance smell.
- **Proposed fix.** Stage 2.5 (A4) of the approved plan: a sticky footer, **conditional** on every
  rejection gate passing — including at 320×568, during scrolling, and with the description field
  focused — or the in-flow footer stays and the limitation is documented. The four `D*` gates are the
  decision procedure; `D3.focus` and `D4.noOcclusion` already pass, so the work is bounded.
- **Cost / risk.** Small (a layout change in one shell component), but it must be measured by all four
  gates, and it changes what the owner has already seen.
- **Decision needed.** Whether to attempt A4 in the remaining time, or to accept the in-flow footer.

### ISS-08 · P2 · Sign-in and delete-everything need a running Supabase

- **Evidence.** `src/app/settings/page.tsx`: with an unusable configuration the screen shows a
  **disabled** switch and a reason; with a usable one it requires a session and redirects to
  `/sign-in`. `RT-T8`'s evidence is a live run against a local stack recorded 2026-10-29.
- **Impact.** The privacy control cannot be demonstrated on a machine without the local Supabase stack
  running, and cannot be demonstrated at all if the environment is misconfigured. The screen handles
  both cases honestly rather than failing silently.
- **Proposed fix.** None needed in code. For the demo: start the local stack before the session, or
  demonstrate the screen's own honest handling of an unusable configuration. Both are acceptable.
- **Decision needed.** Which to show.

### ISS-09 · P2 · The Side view and the figure variants are not built

- **Evidence.** Harness: `S4.side` 4/4 FAIL ("no side view"), `N1.figure` 1/1 FAIL, `N2.views` 1/1
  FAIL. The side zones exist and are tested (`SIDE_ZONES`, 10 zones); the drawing does not.
- **Impact.** None for the MVP as scoped. It is planned work (Phase 2.3–2.4) and must not start before
  the neutral Front/Back figures pass the alignment gates.
- **Decision needed.** None now; recorded so it is not mistaken for a defect.

### ISS-10 · REJECTED · The research blueprint proposes symptom-based red-flag routing

- **Evidence.** `Finding the Words` §3.7: "A small set of descriptor-and-location combinations
  (crushing chest pressure with radiation; sudden worst-ever headache; new neurological symptoms)
  triggers a care-seeking prompt and suspends journaling suggestions. The app routes to care; it never
  reassures."
- **Impact.** This is medical triage. `.clinerules` rule 4 forbids it in the same words: "Do NOT add
  symptom-based emergency rules (chest plus arm suggesting ER is medical triage and is forbidden)."
- **Decision.** **Rejected, permanently, for this product.** Recorded here so that a future reader who
  finds the research blueprint does not mistake it for an approved backlog item.
- **Decision needed.** None.

### ISS-11 · P3 · The question bank's count is twelve in prose and thirteen in the table

- **Evidence.** `src/lib/questionBank.ts` documents the discrepancy in full: Table 11 is titled "The
  complete question bank" and lists thirteen rows (Q1–Q13), while Chapter 5's introduction, Table 5
  and the T6 row all call the bank "twelve". All thirteen rows were transcribed verbatim rather than
  dropping one to force the count.
- **Impact.** None on behaviour; a reviewer may ask. The open question is which number is authoritative.
- **Decision needed.** Confirm thirteen (the table is normative) or approve removing Q13.

### ISS-12 · P3 · Deleting `.next` while a dev server runs stops that server

- **Evidence.** Entry 48 §7 item 1: clearing a half-written `.next` (to recover from a build/start
  race) terminated a running `next dev` process. Nothing in the repository was affected; the remedy is
  `npm run dev`.
- **Impact.** Operational only. `npm run build` does not need the directory removed.
- **Decision needed.** None. Recorded so it is not repeated.


---

## 3. Resolution log — 2026-11-01

Every closure below has a command and a result, not an opinion. The issue bodies in §2 are left as they
were written, so the history of what was wrong is preserved.

### ISS-01 — RESOLVED

`src/app/page.tsx` no longer renders the scaffold. It is a server component that calls
`redirect("/checkin")` (this Next version performs a server redirect by throwing `NEXT_REDIRECT`). No
marketing page was created, by decision.

**Evidence** (`%TEMP%\somamap_iss01_probe.mjs`, 11/11 PASS, production build):

| Check | Result |
|---|---|
| `GET /` answers with a redirect | PASS — status **307** |
| the redirect points at `/checkin` | PASS — `location: /checkin` |
| the redirect sends no scaffold markup | PASS — no `page.tsx`, no `vercel.com/new` |
| a browser opening `/` lands on `/checkin` | PASS — `location.pathname === "/checkin"` |
| the destination is the real check-in screen | PASS — the body map is present |
| the destination shows the fixed line | PASS — found |
| no scaffold text anywhere on the destination | PASS |
| no browser console errors | PASS |
| `GET /checkin`, `/sign-in`, `/settings` still answer | PASS — 200 each |

### ISS-02 — RESOLVED

The owner-approved comparison question is in the reviewed bank as **Q14 "What does it remind you of?"**,
the mock session's third question is now Q14, and the card's `intensity_metaphor` takes the answer to
that question when the user has not phrased a comparison themselves ("like …" still wins, because a
comparison the user built is the most reliable signal). Nothing is inferred from unrelated answers, and
a missing comparison still leaves the row empty.

The audit was not weakened: `tests/redteam/t6-bank-audit.ts` keeps its **own** transcription of
Table 11's thirteen rows and now keeps its own copy of the approved addition, so any other insertion,
any rewording, any removal and any reordering still fail. `T6` passes with the addition named in its
evidence line.

**Evidence:** `npm test` — T4 reports the sequence `Q1 -> Q4 -> Q14`; T6 reports "Table 11's 13 rows
plus the 1 owner-approved addition(s) (Q14, approved 2026-11-01 for ISS-02)"; `CF-08`, `CF-16`,
`CF-17`, `CF-18` pass.

### ISS-03 — RESOLVED

The bare preposition `"for"` was removed from `TIME_WORDS`; every entry left is a time word or a time
unit, so "for about three hours" still matches through "hours".

**Evidence** (`CF-09`, `CF-09b`, `CF-09c`, `CF-09d`): "I am looking for a word for it.", "I have been
waiting for it to pass." and "It hurts when I reach for things." all leave `duration` empty and render
"Not answered yet"; "For about three hours." and "It has been present for three hours." both reach the
duration row verbatim; a session with no time phrase leaves it empty.

### ISS-04 — RESOLVED

A filler filter (`FILLER_WORDS`) drops numbers and pure function/spatial words from `quality_words`.
Descriptions are untouched: "tight", "heavy", "sharp", "numb", "aching", "tingling", "waves" and their
like all pass through. Nothing is paraphrased and nothing is fabricated to reach five.

**Evidence** (`CF-10`): "It stays in one spot." now yields an empty quality row (rendered "Not
answered yet") while `user_own_sentence` still quotes the sentence verbatim; "A tight, heavy band that
comes in waves." yields `["tight", "heavy", "band", "waves"]`.

### ISS-05 — RESOLVED

`user_own_sentence` is now the user's longest answer that is **not already used as the duration**, so
two rows do not carry the same text. When every answer is the duration, the longest still stands - a
repeat beats an empty row - and the text is never rewritten.

**Evidence** (`CF-19`, `CF-20`).

### ISS-06 — PARTIALLY RESOLVED (alignment and coverage closed; touch targets split out)

The figure is now drawn from **the view's own zone rectangles** rather than from a shared eleven-rect
mannequin, so the drawn shape and the tappable shape are the same rectangles. That is a correction as
well as a fix: Table 9 makes the arms and hands back-view regions and the head and neck front-view ones,
so each view now draws precisely the body it can name, and the two views together cover all fourteen
regions.

**Evidence** (visual harness, production build, 2026-11-01): `L2.overhang` **PASS 8/8** ("7 zones,
every perimeter point on the figure", both views, all four viewports) and `L2.coverage` **PASS 8/8**
("128 figure samples, all inside a zone" front; "135 figure samples" back). Both gates were used
unchanged. Whole-run failures fell from 56 to 40, with 16 gates moving from FAIL to PASS.

The touch-target half of ISS-06 is now tracked separately as **`ISS-13`**, because it is a different
kind of problem (arithmetic, not geometry) and it cannot be fixed by drawing.


---

## 4. `ISS-07` — the fixed line is below the fold on a phone (P1, measured, not resolvable)

**The sticky fix was built and measured, exactly as the owner's instruction required.**

| Gate | In-flow (current) | Sticky (`sticky bottom-0 z-10 bg-paper`) |
|---|---|---|
| `D1.firstScreen` — visible on the first screen | FAIL 7/10 | **PASS 10/10** |
| `D2.scrolling` — visible at every scroll position | FAIL 7/10 | **PASS 10/10** |
| `D3.focus` — visible with the field focused, and not covering it | PASS 3/3 | PASS 3/3 |
| `D4.noOcclusion` — never covers a control | PASS 10/10 | **FAIL 7/10** |

`D4` failed with the detail `4 position(s), first at y=309: TEXTAREA` at 320x568 and
`6 position(s), first at y=0: TEXTAREA` at 390x844 — a pinned footer covers the **description field**,
including from the moment the screen opens at 390px.

**Root cause.** A pinned footer overlays whatever content flows through the bottom of the viewport. The
union of its pinned band over the whole scroll range is `[viewportHeight - footerHeight, pageHeight]`,
and the description field sits inside that band on every phone width, so no pinning can satisfy `D4`
while the field is below the fold. Removing the overlap would mean moving the description field above
the figure, which would push the body map - the primary interaction - below the fold.

**Attempted fixes.** (1) sticky at the bottom with an opaque background: failed `D4` as above;
(2) sticky at the top: rejected before building - it would cover the View controls as they scroll past;
(3) shortening the page so the footer fits the first screen: impossible, the content is ~1145px tall
against a 568px viewport, and the figure alone is 384px.

**Decision.** Per the owner's explicit instruction - "if sticky positioning fails an acceptance gate,
use the documented in-flow fallback and record the limitation" - the in-flow footer stands. The
limitation is recorded in the component itself, where a future reader will find it.

**Impact and mitigation.** The line is **rendered on every screen at every viewport** (`P1.line`
11/11 PASS) and the copy scan is clean, so iron rule 5's requirement is met in the product; what fails
is that a phone user must scroll once to *see* it. It is visible without scrolling at 768x1024 and
1440x900. This is a presentation limitation, not a compliance failure.

---

## 5. `ISS-13` — the 44px touch target is unreachable on a phone (P1, proven)

**Claim.** No arrangement of the existing region definitions can give the `neck` zone a 44x44 CSS px
target on a 320px-wide screen.

**Arithmetic.** The map is 1000 units wide and is rendered across the figure's own width. The neck is
76 units wide, i.e. **7.6%** of the figure. At phone widths the figure is capped at 240px, so the neck
is **18.2px** wide; even at the full 280px content width of a 320px screen it would be **21.3px**. For
44px the figure would have to be **579px** wide - wider than the viewport - or the neck would have to
be **183 units**, wider than the head (164). Even WCAG 2.2 AA's 24x24 minimum would need 100 units, a
32% widening of an anatomical band.

**What was tried.** A3 (already approved) grew the neck from 60 to 62 units, lifting its height from
23px to 23.8px - correct, and nowhere near 44. Widening the rendered figure was considered and
rejected: it makes the page taller and would worsen `ISS-07`. Invisible enlarged hit areas were
considered and rejected: they would change which `<g>` captures a pointer event for a measurement win
that `T1` (which measures the drawn zone) would not grant anyway, and that is not a decision to take
unilaterally.

**Impact.** On a phone the neck is a small target. It remains usable, and at 768px and up the figure
renders at 320px so the neck reaches 24.3px, meeting WCAG 2.2 AA.

**Options for the owner.** (a) widen the neck zone to 100 units (24px at 320px - WCAG 2.2 AA, still not
44); (b) change the gate's threshold to a justified standard, which the mission forbids doing merely to
pass; (c) accept and document, as now. **Nothing was changed**, and `T1.zone44`/`T2.control44` remain
red at 10/10 viewports as honest evidence.

---

## 6. `ISS-23` — the helper showed one list on every question, and the words of not knowing were shown as vocabulary (P1, fixed 2026-11-04)

**Reported by the owner** after a manual session on the protected Preview, with the finished card pasted
back:

> Where: head · Words you chose: tingling, fluttering · It feels like: **Not answered yet** · In your
> words: "I feel something, but I don't know how to describe it."

Three defects were visible in that one card, and the third was found while reproducing it.

- **Evidence (A) — one list for every question.** The helper rendered `SENSATION_VOCABULARY`
  unconditionally: `src/components/InterviewChat.tsx` had `{SENSATION_VOCABULARY.map(...)}` inside the
  `<details>` block, and the block never read the question. `question.id` was in scope and unused, so
  Q1 ("Does it stay in one spot, or does it spread out?"), Q4 (the four textures) and Q14 ("What does it
  remind you of?") all showed the same eight behaviour words. The reviewed bank already carries the
  vocabulary each question names — it was there all along and simply was not being used.
- **Evidence (B) — why the row was empty.** `intensity_metaphor` is filled by exactly two things
  (`src/lib/cardFidelity.ts`, `ownFields` lines 434–444): an answer that states a resemblance
  ("like …"), or the **comparison question's** answer when `isComparisonShaped` accepts it. The
  comparison question *was* asked — it is the session's third question — and the person answered it with
  a tapped word list, which the comparison rule refuses **by design** (correction 4's three-word floor,
  and the not-knowing words). So the row was empty and the card rendered "Not answered yet". **Nothing
  was dropped and the fallback card was not involved**: a fallback card keeps the reviewed metaphor copy
  ("like a quiet background hum") and would have shown it. A read-only probe through the real state
  machine reproduced the owner's card byte for byte on the model-draft path, and showed that the mock
  path would have added "don't, know, describe" to "Words you chose" — which is how defect (C) was
  found.
- **Evidence (C) — the words of not knowing shown as vocabulary.** `NON_QUALITY_WORDS` holds `dont`
  without the apostrophe and `FILLER_WORDS` holds neither `know` nor `describe`, so the words of "I feel
  something, but I don't know how to describe it" reached the row labelled **"Words you chose"**. The
  words are the person's own, but they describe no quality of anything, and the row read as the product
  attributing vocabulary to someone who had just said they had none.
- **Impact.** The helper answered "what words exist" rather than "what words fit this question", and the
  person it exists for — someone with no words — could not answer the comparison question at all, so the
  row the feature was built to fill stayed empty. In the demo the card is the product's output, and one
  of its five rows read "Not answered yet" for the exact user the feature is for.
- **What must NOT be done.** No metaphor may be invented or borrowed from another answer; the five-field
  schema, the reviewed bank, the comparison rule and the crisis shield are untouched; the person's
  sentence stays quoted verbatim; no question is written.
- **Fix.** The list is chosen by the question id the route sent (`VOCABULARY_BY_QUESTION` /
  `vocabularyFor` in `src/lib/vocabulary.ts`), and each group is the question's **own approved wording**
  — "in one spot"/"spreading out" for Q1, the four textures for Q4, "a coin"/"a palm"/"wider" for Q7,
  and so on. The comparison question (Q14) offers the bank's four comparison phrases from Q5, each of
  which already satisfies `isComparisonShaped`, so a tap fills `intensity_metaphor` through the
  **existing** pipeline with the person's own words. `Q11` and `Q13` offer nothing, because they ask for
  the person's own word and their own number; an unknown or absent id falls back to the general list;
  and a question with no group renders no helper rather than an empty one. The same helper is offered in
  the revision flow, keyed to `revisionQuestion(draft).id`. Separately, the uncertainty words
  (`UNCERTAINTY_WORDS`) no longer reach `quality_words` on either path — the session's own words or a
  model's selection — while the sentence keeps its place verbatim.
- **Decision.** Approved by the owner 2026-11-04: the grouping table (including "no suggestions" on Q11
  and Q13); hiding the helper where the group is empty; the narrow uncertainty filter; the revision
  helper; and leaving the "Not answered yet" copy unchanged for now.
- **Evidence.** `npm run test:unit` — **493/493 pass**; `npm test` — unit suite exit 0 and the red-team
  pack **8 PASS, 0 FAIL, 0 NOT IMPLEMENTED** (T5 copy scan reads 102 text files with zero hits; T6 still
  diffs the bank against Table 11 plus the one approved addition); `npx tsc --noEmit` and `npm run lint`
  (0 errors) and `npm run build` all green; the harness journey gates (`J1.card`, `J3.fields`,
  `J2.region`, `P1.line`, `P4.disclosure`, `P5.acknowledged`, `P6.declined`, `P3.console`) PASS, and its
  43 remaining failures are exactly the documented pre-existing set — `T1.zone44`/`T2.control44`
  (`ISS-13`), `D1.firstScreen`/`D2.scrolling`/`D3.focus` (`ISS-07`), `S4.side`/`N1.figure`/`N2.views`
  (`ISS-09`) — with the same counts as before this change.

---

## 7. `ISS-24` — one check-in became four journal entries (P1, fixed 2026-11-04)

**Reported by the owner** after a manual session on the protected Preview: one check-in (answers `in one
spot`, `tight`, `a tight knot`), then "Change the region" and a tap on `head`. The card on screen was
right, and the journal held **four** rows for that one check-in — two with `head` and two without a
region — taking the count from 2 to 6.

- **Evidence — the write.** `src/components/InterviewChat.tsx` saved on every `complete` transition (the
  save effect, guarded by the completed state object in a ref). That guard is right for a repeat of the
  *same* completion and blind to a *new* one, and every rebuild produced a new one: "Change the region"
  unmounts the screen (`CheckInFlow.tsx`, `onBack`), the answers are kept in `session`, and the interview
  mounts again with `resume={session}` and walks the whole session back through the route (`replay` →
  `replayPlan`) into a fresh `complete`. `Edit my answers` does the same thing.
- **Evidence — the store.** `saveJournalCard` (`src/lib/journalStore.ts`) is insert-only: `POST
  /rest/v1/sessions`, then `POST /rest/v1/cards`. A grep across `src/` finds no `PATCH`, `PUT`, `upsert`
  or `on_conflict` anywhere, and the client sent `{ card, view }` with **no id** — so the second
  completion could not have updated the first row even in principle. The route returned the new card's id
  and the client discarded it (`return { ok: response.status === 201 }`).
- **Evidence — measured.** A read-only probe (a copy of the harness, run from `%TEMP%`, signed out so
  nothing was written) drove a check-in and two region-change rounds: interview requests 4 → 7 → 10 and
  **completions 1 → 2 → 3**, with the two `head` rounds sending byte-identical bodies. One round is one
  insert, and a round that taps no new zone rebuilds the *same* card — which is exactly how a single
  check-in ends up with identical pairs.
- **Impact.** The journal is the product's only history and its count is what the weekly roundup drafts
  from. One check-in reading as four entries is not cosmetic: it makes the count meaningless.
- **What must NOT be done.** No upsert as a shortcut; no second card field; no change to the five-field
  schema, the bank, the crisis shield, the consent path, the RLS policies or the migration; and the four
  rows already in the journal are left alone.
- **Fix.** The identity travels with the session. `postJournalCard` sends `cardId` and `sessionId` when the
  screen is rebuilding a card and omits them when the card is new; the route validates both as uuids (both
  or neither) and dispatches to `updateJournalCard`, which `PATCH`es the session's `region_label` and
  `view` and then the card's five fields — the insert path's mirror, and untouched when there is no
  identity. `CheckInFlow` holds the identity beside the session, so it survives the unmount a region change
  causes, and clears it in `startNewCheckIn` and on the crisis way back, so a genuinely new check-in still
  inserts. A `PATCH` that matches no row is a failure, which is what an unauthorized update looks like
  under row-level security.
- **Evidence.** `npm run test:unit` — **515/515 pass** (22 new); `npm test` — red-team **8 PASS, 0 FAIL**
  (T5 reads 103 files; T1/T2/T4 unchanged); `npx tsc --noEmit`, `npm run lint` (0 errors) and
  `npm run build` green; the harness reports **187 passed / 43 failed of 230**, its 43 being exactly the
  documented pre-existing set (`T1.zone44`/`T2.control44` = `ISS-13`, `D1.firstScreen`/`D2.scrolling`/
  `D3.focus` = `ISS-07`, `S4.side`/`N1.figure`/`N2.views` = `ISS-09`), with the new **`J5.rebuild` PASS**
  ("3 request(s), 1 completion, region [head, head, head], card names head") and `J4.regionSent` now
  reading the check-in's own turns.
- **Not fixed, by decision.** The four existing duplicate rows are untouched; cleaning them up is a
  separate decision for the owner.


