# SomaMap — MVP Scope (authoritative)

**Status:** the authoritative definition of what this MVP is. Written 2026-11-01 for a submission
deadline of approximately three days.

**Authority.** `.clinerules` (the SomaMap Compliance Shield v1.0) is authoritative and is not
modified by this document. The build blueprint (`SomaMap-Dummy-Proof-Build-Blueprint_latest.pdf`)
and the market validation report are the approved product sources. Where this document and any of
them disagree, they win and this document is wrong. `docs/PHASE-2-PLAN.md` governs the body-map
visual work; this document governs the MVP's *content*.

**Related records:** `MVP-TRACEABILITY.md` (feature → criteria → tests → UAT → status),
`UAT-REGISTER.md` (the scenarios), `ISSUES-AND-BLOCKERS.md` (defects and blockers),
`RELEASE-READINESS.md` (the gate summary).

---

## 1. Product promise

> **SomaMap is a vocabulary and journaling tool. It does not interpret sensations or give medical
> advice.**

SomaMap helps a person find words for what they feel in their body, and hands those words back to
them, better organised and in their own voice. It is a **mirror, not an adviser**: it reflects the
user's own description and adds nothing to it — no cause, no condition, no severity verdict, no
recommendation, no reassurance.

What that means in practice, and what it forbids:

- It **may** name a body region from a fixed map, offer a reviewed question about the *texture* of a
  sensation, and lay the user's own words out as a five-field card.
- It **may not** say what a sensation means, what might have caused it, how serious it is, or what to
  do about it. Not in a field, not in copy, not in a log, not in a summary.
- When in doubt, SomaMap is **less helpful on purpose**. A blank row reading "Not answered yet" is
  always preferable to a plausible guess.

## 2. Intended user

An adult who can feel something in their body and cannot put it into words — the person who answers
"how are you feeling?" with "not great, I just don't feel right". They may be preparing to describe
it to a clinician, but SomaMap does not serve the clinician: it serves the person's own vocabulary.

The MVP assumes a phone-width screen, a person alone, and no account. It assumes nothing about their
health, their diagnosis, or their literacy beyond plain English.

## 3. The exact MVP user journey

One journey, two optional side paths. Every screen carries the fixed line from iron rule 5.

| # | Step | Screen / route | What must be true |
|---|---|---|---|
| 1 | Open the app | `/checkin` | The step label "Check in", the prompt "Where do you feel it?", and the instruction to tap the body map are on screen |
| 2 | Tap a region | `/checkin` | The tap names a region from the **fixed geometric map** and shows it as `Region: <label>`; a pin marks the point; exactly one zone is selected |
| 3 | Describe it, optionally | `/checkin` | A free-text box labelled "Anything you want to put into words", placeholder "Type a few words, or leave it blank." It is **optional** and says so |
| 4 | Continue | `/checkin` | "Continue" moves to the interview |
| 5a | Crisis path | crisis screen | If the typed text contains explicit crisis or self-harm language, the whole flow is replaced by the static crisis screen: the four contacts, "Nothing you typed was saved", and a way back. **Nothing is saved.** "Back to check-in" returns to an empty check-in |
| 5b | Interview | `/checkin` (interview step) | Three questions, one at a time, each the approved wording from the bank. Progress reads "Question n of 3". The user types each answer |
| 6 | The card | `/checkin` (card step) | After the third answer the card renders the five schema fields in order, plus the fixed line. Nothing is saved, and the screen says so |
| 7 | Optional: own your data | `/sign-in` → `/settings` | Sign in, then "Delete everything": one confirmation, then rows and storage objects are removed while the account remains |

**Not in the journey, and not claimed:** creating an account as a prerequisite, saving a check-in,
revisiting a past check-in, exporting anything, printing anything, sharing anything with a clinician,
or any reminder to come back.

## 4. The five-field sensation card

The card is the product's output and its schema is locked (iron rule 1). Exactly five fields, no
sixth, enforced by `z.object({...}).strict()` in `src/lib/schema.ts`:

| Field | Type | Rule |
|---|---|---|
| `location_label` | string | Always the label the user selected, from the fixed map. Never a model's word |
| `quality_words` | string[] | **Max 5.** Words the user actually typed, in the order they typed them |
| `intensity_metaphor` | string | The user's own comparison, verbatim. Empty when they made none |
| `duration` | string | The user's own time phrase, verbatim. Empty when they gave none |
| `user_own_sentence` | string | One of the user's answers, quoted exactly |

Two rules make the card trustworthy, and both are already implemented:

1. **Every value is the user's own material, or it is empty.** There is no field for advice,
   interpretation, cause, diagnosis, recommendation or "insight" — in the database, the schema, or
   the UI. An empty field renders as "Not answered yet", never as a placeholder or a guess.
2. **A card that fails the strict schema does not reach the screen.** The reviewed `FALLBACK_CARD`
   renders instead, and the refusal is recorded server-side as a category (key names, question ids,
   mode) — never as content.

## 5. The five Iron Rules, and the other non-negotiables

Restated from `.clinerules`, which is authoritative:

1. **Schema lock.** A sensation card contains exactly five fields. There is NO field for advice,
   interpretation, cause, diagnosis, recommendation or "insight" — not in the database, not in the
   Zod schema, not in the UI. Never add one. A model response carrying advice is stripped and the
   reviewed fallback card is returned.
2. **Texture, not triage.** Interview questions may ask about the feel and shape of a sensation —
   spot or spread, surface or deep, steady or wave-like, what it reminds you of. They must NEVER ask
   clinical provocations (does it change when you breathe, move or eat; does it radiate; have you had
   this before) and must NEVER suggest a cause, system or condition. Every question comes from the
   reviewed bank; the model may not invent one.
3. **Patterns are vocabulary, not conditions.** Any counting or clustering may use only the user's
   own words. It must NEVER correlate sensations with conditions, suggest what they mean, or generate
   health "insights". Weekly roundups are drafts the user edits.
4. **Crisis shield is numbers, not triage.** Explicit crisis or self-harm language stops the loop and
   shows the static crisis screen — **988** (US), **116 123** (UK), **112** (Nigeria and the EU),
   plus **findahelpline.com** — and saves nothing. The trigger is language, never a pattern of
   sensations. Symptom-based emergency rules (for example chest plus arm suggesting an emergency
   room) are **forbidden**: that is medical triage.
5. **Copy discipline.** The words `symptom`, `diagnosis`, `treatment` and `indicates` never appear in
   UI copy. The word is always **sensation**. Every screen shows the fixed line: *"SomaMap is a
   vocabulary and journaling tool. It does not interpret sensations or give medical advice."*

Other non-negotiables the MVP inherits:

| # | Requirement |
|---|---|
| N-1 | The fixed line renders on **every** screen, from exactly one component (`DisclaimerFooter` via `Screen`) |
| N-2 | The region label comes from the fixed geometric map in `src/lib/regions.ts`, never from model output |
| N-3 | All model calls run server-side; keys live in `.env.local` only, never in client code, never committed |
| N-4 | Every generated card passes Zod `.strict()` validation before render; invalid output falls back to the static card |
| N-5 | Crisis contact details are the four above, verbatim; no local number is invented |
| N-6 | The crisis screen never repeats what the user typed |
| N-7 | Nothing is persisted by the check-in or interview path; the screens say so |
| N-8 | If a task seems to require interpreting user data, it is flagged as out of scope rather than built |
| N-9 | The five-field schema, the API contract and the crisis handling are **not changed** by any MVP work |

## 6. Included features

The MVP is deliberately small. Each feature carries a stable ID used by every other MVP document.

| ID | Feature | Status (2026-11-01) |
|---|---|---|
| **F-01** | Fixed body map: front/back silhouettes, 14 regions, tap-to-name, keyboard-operable | Implemented, visually unfinished (blocky figure; alignment and touch-target gates red) |
| **F-02** | Optional free-text description on the check-in screen | Implemented |
| **F-03** | Crisis stop: static screen, four contacts, saves nothing, back to an empty check-in | Implemented |
| **F-04** | Three-question interview from the reviewed bank, one at a time, with progress | Implemented |
| **F-05** | The five-field sensation card, schema-locked, with "Not answered yet" for missing answers | Implemented |
| **F-06** | Copy discipline: the fixed line everywhere, and the four forbidden words nowhere | Implemented and asserted on every run |
| **F-07** | Server-side model boundary: mock mode by default, live mode fails closed, refusal logged as a category | Implemented |
| **F-08** | Privacy controls: sign in, then delete everything (rows and storage), account preserved | Implemented; needs a running Supabase and a session |
| **F-09** | Responsive, accessible phone-first layout (320 px upward), light and dark | Implemented for the check-in journey |

**Explicitly not MVP features, though they exist in the repository:** the weekly-roundup pattern
module (`src/lib/patterns.ts`), the database schema and RLS policies, and the storage helpers. They
are supporting infrastructure or later-phase work; they are not part of the demo path.

**One approved addition to the reviewed bank (2026-11-01).** The interview's three questions did not
invite a comparison, so the card's `It feels like` row was usually empty. The owner approved one extra
question, **Q14 "What does it remind you of?"**, which is now the session's third question. It satisfies
iron rule 2 by construction - rule 2 names "what it reminds you of" as a permitted texture question -
and it is recorded in the bank as an *owner-approved addition* beside Table 11's unchanged thirteen
rows, so the bank audit still catches any unapproved drift. **No duration question was added**: the
owner's decision is that an honestly empty `How long` row is preferable to a fabricated one, and no
answer is ever invented to fill it.


## 7. Explicitly excluded features

These are excluded from the MVP. Several are the most attractive things to build; that is why they
are written down. None of them may be added without a decision that also answers the compliance
question each one raises.

| Excluded | Why it is out |
|---|---|
| Severity or intensity scoring (a 0–10 slider, a faces scale, any number) | Iron rule 1: a score is a judgement about the user's sensation, and a number invites triage. The blueprint's own F3/F3b |
| Context tags (sleep, stress, food, movement, medication, cycle, weather) | Collects data for correlation, which iron rule 3 forbids, and it is the research blueprint's F4 |
| A persistent journal or saved check-in history | Rule 3 and the privacy posture: nothing in the MVP path is persisted. Research blueprint F8 |
| Trend analysis, charts, correlation or "co-occurrence" statistics | Rule 3 forbids correlating sensations with anything. Research blueprint F9 |
| Trigger detection, flare detection, baseline flagging | Cause attribution by another name. Research blueprint F10 |
| Treatment or medication response tracking | Implies a treatment relationship. Research blueprint F11 |
| Clinical reporting, a visit-prep report, PDF/print export, clinician share links | Makes the product an input to clinical decisions. Research blueprint F12/F13/F14 |
| Voice transcription or voice memos with extraction | New data class, new provider, new privacy surface; and "suggested descriptors" is model interpretation. Research blueprint F7 |
| Clinical decision support, red-flag routing, "seek care" prompts | **Directly conflicts with iron rule 4.** The research blueprint's guardrails propose exactly this (crushing chest pressure with radiation; sudden worst-ever headache). It must not be built |
| Word-of-the-day trainer, spaced repetition, adaptive word ordering | Scope, not compliance — but it changes the product into a learning app. Research blueprint F5/F6 |
| Any advice, interpretation, diagnosis, cause, recommendation or "insight" | Iron rule 1, in one line |
| Accounts as a prerequisite, social features, analytics or advertising SDKs | Not needed for the promise; each adds a privacy surface |

**A note on the research blueprint.** `Finding the Words — Body-Symptom Vocabulary App Blueprint`
(Z.ai, November 2026) proposes fifteen features (F1–F14 plus a data model) on a 90-day Phase-1 MVP
that is far larger than this one. Its *diagnosis* is sound and matches ours — the bottleneck is
vocabulary, body maps let people point instead of name, and describing is not interpreting. Its
**MVP cut is not this MVP.** The features are recorded as future candidates in
`MVP-TRACEABILITY.md` §5 so nothing valuable is lost, and the two places where it conflicts with
`.clinerules` (red-flag routing; severity and context capture) are recorded as **rejected**, not
deferred.

## 8. What a successful MVP demonstration is

A demonstration is successful when one person can be shown the whole promise in **three minutes**,
on a phone-sized window, with nothing on screen that contradicts the product rules. Concretely:

| # | Demonstration step | Passes when |
|---|---|---|
| D-1 | Open the app at its entry point | SomaMap is on screen — **not** a framework scaffold (currently blocked; see ISS-01) |
| D-2 | Tap a body region | The tapped region is named, the pin marks the tap, and the label came from the fixed map |
| D-3 | Type a few words and continue | The interview begins and asks an approved question |
| D-4 | Answer three questions | Each question is from the bank; progress is visible; no question asks a clinical provocation |
| D-5 | See the card | Five rows in order, every value traceable to something the user typed or tapped, and the fixed line beneath |
| D-6 | Show the crisis path | Explicit crisis language replaces the flow with the four contacts; nothing is saved; back returns to an empty check-in |
| D-7 | Show the privacy control | Settings says which project it will act on, and the destructive action is two-step |
| D-8 | The honesty check | Nothing on any screen interprets, scores, advises, or names a cause — and the fixed line is present on every screen |

**Not required for a successful demonstration:** a beautiful figure (F-01 is unfinished), a working
sign-in/delete path (needs the local stack), a landing page beyond the entry point, or any feature
from §7.

**Required to be honest in the demonstration:** if a card row is empty because the session never
asked for it, that is shown as "Not answered yet" and explained — never filled in for the demo
(see ISS-02).

