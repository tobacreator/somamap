# SomaMap — demo and submission status

**Readiness: ready with limitations.** The core journey is verified working in production, the repository is
green on every gate, and the demo materials are complete. **No demo video exists yet** — no screen-recording
tool is available in this environment, and I will not claim one I do not have. Section 6 is the smallest set
of steps to record it yourself.

## 1. What is verified working in production

Verified by you, on `https://somamap-ebon.vercel.app`, and confirmed by read-only checks here:

- Create an account, sign in, complete a check-in, generate a card, save it, open the journal, refresh, and
  the card is still there.
- The saved card carries the five fields, and the journal counts the words you chose and lists the place you
  named.
- The deployment is in **live** mode: the interview is worded by the model (a reasoning model — five to
  sixteen seconds per question).
- `/`, `/sign-in`, `/journal`, `/checkin` and `/reset-password` all answer `200`.
- Gates on the current `main`: `tsc --noEmit` exit 0 · `lint` 0 errors · `npm test` red-team **8/8 PASS** plus
  the unit suite · `npm run build` success, 18 routes.

## 2. Known limitations (none of which block the demo)

- **The original account's sign-in is unresolved.** Do not use it for the demo; the demo account works. This
  does not affect any other user or any saved data.
- **No demo video yet** (see section 6).
- **`duration` ("How long") is empty and its row is hidden**, because no approved question asks how long. This
  is deliberate and documented; the card still carries all five fields.
- **The fixed disclaimer line sits below the fold on a phone.** It is rendered on every screen at every width
  and is one swipe away.
- **The recovery screen's "expired" message** can appear after a *successful* password change if the same link
  is opened twice — the link is single-use. Cosmetic; noted for a later fix.

## 3. Hackathon requirements — verified vs recommended

**Verified from the official event page** (`https://dev.meta.ai/events/global-hackathon`, read for this task):

- **Track 1 — Indie developer track:** "For individual builders and students. Judged on **creativity,
  technical ambition, and whether it works.**" SomaMap enters this track.
- **Theme 1 — Build for Your World:** "Bring Meta's models into your domain. Solve a problem you know
  firsthand, free up time and mental space, and make something possible that wasn't before."
- **Models:** the Muse Spark series (including **Muse Spark Open**) through Meta Model API. SomaMap's live
  integration calls **`meta-models/muse-spark-open-1026`** — a Muse Spark Open model — through Baseten's
  OpenAI-compatible Model APIs, which is the credential the hackathon issued for it.
- **Deadline:** "**Nov 4 Project submissions due by 9:00 PM ET**", i.e. **02:00 UTC on Nov 5 / 03:00 CET**.
- Submissions go through the hackathon's own portal, which I have **no access to** and have not touched.

**Not specified on that page, therefore treated as recommendation:** any video length (this demo targets
90–120 seconds), any required video format, and the exact submission form fields. Do not treat the video
length as a rule; do treat it as a good length for a judge's attention.

## 4. Draft submission description

> **SomaMap — find the words for what you feel**
>
> You know what you feel. Finding the words is another matter. SomaMap is a vocabulary and journaling tool
> that helps you describe a physical sensation in your own words and keep those words somewhere you can find
> them again.
>
> You tap where you feel it, describe it in a sentence or two, and then answer three short questions about
> how it feels — spot or spread, steady or wave-like, what it reminds you of. A Muse Spark Open model
> (`meta-models/muse-spark-open-1026`, through Baseten's Model APIs) reads what you wrote and **chooses which
> of SomaMap's own reviewed questions comes next**, and offers a handful of plain words you may tap or
> ignore. The questions' wording is never written by the model: it selects from a fixed, reviewed bank, and
> the region on the card comes from the app's own fixed map.
>
> What comes out is a card with exactly five fields — where, the words you chose, what it feels like, how
> long, and your own sentence — and nothing else. There is no field for what a sensation might mean, because
> the schema has no such field: a model reply carrying a sixth key is rejected whole and the reviewed fallback
> card stands in. The journal keeps your cards and counts the words on them, and it says plainly what those
> numbers are: counts of your own words, and nothing more.
>
> SomaMap does not diagnose, interpret, or advise, and it never says what a sensation means. Every screen says
> so: *"SomaMap is a vocabulary and journaling tool. It does not interpret sensations or give medical
> advice."* When a model reply cannot be validated, the product fails closed to reviewed wording rather than
> showing something unverified; if you write explicit crisis language, the loop stops at a static screen with
> crisis numbers and saves nothing.
>
> **Built with:** Next.js (App Router), TypeScript, Tailwind; a strict five-field Zod schema as the single
> source of truth for what a card is; one server-side provider boundary with an injected transport and no
> retries; Supabase Auth and Postgres with row-level security for accounts and the saved journal; an
> in-session journal in the browser tab for people who have no account; a public-demo guard bounding request
> size and rate; and a red-team pack that re-checks the crisis screen, advice injection, extra-field attacks,
> prompt injection, the question bank and the copy discipline on every run.
>
> **Track:** Indie developer. **Theme:** Build for Your World.

## 5. What is ready

| artifact | location | state |
|---|---|---|
| Spoken narration, 90–120 s | `demo/DEMO_SCRIPT.md` | complete |
| Scene-by-scene actions, timing, edit points | `demo/DEMO_STORYBOARD.md` | complete |
| Setup, test data, recording settings, review | `demo/RECORDING_CHECKLIST.md` | complete |
| Status, requirements, submission description | this file | complete |
| Working production app | `https://somamap-ebon.vercel.app` | verified |
| Public source repository | `https://github.com/tobacreator/somamap` | public, MIT |
| Demo video | — | **not created** |

## 6. Recording the video — the smallest possible steps

No recording tool is available to me here, and I will not claim a video I did not make. What you need is
already on Windows:

1. **Open a private window** to `https://somamap-ebon.vercel.app`, close every other tab, turn on Focus
   assist, and have the demo account's credentials on paper.
2. **Start a recording** of the browser window: **Snipping Tool → Record** (Win+Shift+S) or **Xbox Game Bar**
   (Win+G). Record the window, not the desktop.
3. **Follow `demo/DEMO_STORYBOARD.md`**, speaking the narration from `demo/DEMO_SCRIPT.md`. Let the model
   think; keep recording.
4. **Stop, review against section 6 of the checklist**, and cut the thinking pauses in any editor (or in
   YouTube's own trimmer) to land at 90–120 seconds.
5. **Upload unlisted**, check the link opens in a private window, and paste it into the submission.

## 7. The shortest path to submission

1. **Record and upload the demo** (section 6) — this is the only thing still missing.
2. **Submit before 9:00 PM ET today**, pasting: the deployed URL `https://somamap-ebon.vercel.app`, the
   repository `https://github.com/tobacreator/somamap`, the demo link, and the description in section 4.
3. **Optional, only if time allows:** retry the original account's sign-in once in a private window — the
   deployment was rebuilt after the environment correction, so it may now work. Do not spend the remaining
   time on it; the demo account is verified.

