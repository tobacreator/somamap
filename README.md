# SomaMap

**Find the words for what you feel.**

SomaMap is a vocabulary and journaling tool. It does not interpret sensations or give medical advice.

You know what you feel. Finding the words is another matter. SomaMap helps you put physical sensations into
words - one question, one description, one moment at a time - and keeps every word yours.

---

## What SomaMap does, and what it does not do

**It does:**

- Ask a short interview of reviewed, sensory questions ("Does it stay in one spot, or does it spread out?").
- Offer a small set of plain descriptive words for the question being asked, which you may tap, ignore, or
  replace with your own.
- Let the model choose *which reviewed question* comes next, from what you have written.
- Collect your answers into a five-field sensation card, in your own words.
- Keep a journal of your cards, and count the words you chose.
- Let you edit a card's sentence and its place afterwards.

**It does not:**

- Interpret a sensation, name a cause, or suggest what it means.
- Diagnose, treat, or advise, and it never says what you should do.
- Claim to understand your body.
- Add a field for advice, a cause, a condition, or an "insight" - the card schema is locked to five fields,
  and a model reply carrying a sixth key is refused whole.

## The two ideas behind it

**Build for your world.** A person can feel something clearly and still have no words for it. SomaMap does
not require medical vocabulary, a complete sentence, or a name for the sensation before it will help.

**Push the frontier.** The interview is guided by a model that chooses the next reviewed question from what
the person wrote, and offers its own words for that question. The wording of every question is the
application's own reviewed copy, and the person keeps the last word on every word that reaches their card.

## Architecture

| layer | what it is |
|---|---|
| Framework | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Model boundary | `src/lib/models.ts` - one `ModelAdapter` interface (`questionSequence`, `interview`, `guide`), three implementations: mock (recorded fixtures), live (provider), unavailable (refuses) |
| Provider client | `src/lib/baseten.ts` - one chat-completions request per turn, an injected transport, a 20 s timeout, no retries, nothing logged |
| Guided interview | `src/lib/guide.ts` - the model returns a **question id** and a few options; the id is validated against exactly the ids the prompt carried, and the question's wording always comes from `src/lib/questionBank.ts` |
| Interview state machine | `src/lib/interview.ts` - crisis screening first, then the consent gate, then the next question or the card |
| Card integrity | `src/lib/schema.ts` (strict five-field Zod), `src/lib/draftGuard.ts` (prohibited language), `src/lib/cardFidelity.ts` (grounding: the region, the duration and the person's sentence are always theirs) |
| Journal | `src/lib/journalStore.ts` (server, as the user, under RLS), `src/lib/anonJournal.ts` (in-session, browser-tab storage), `src/lib/patterns.ts` (counts of the user's own words) |
| Public-demo guard | `src/lib/demoBudget.ts` - request-size caps, per-field length caps, a per-visitor window and a per-instance backstop |
| Tests | `node --test` unit suite, a red-team pack (`tests/redteam`), and a visual harness (`tools/visual-harness`) |

### The AI integration

One request per interview turn to an OpenAI-compatible chat-completions endpoint. The request carries the
person's own material and nothing else - their description, the location they chose or typed, their answers
with the reviewed question id each answers, and the candidate question ids with the wording they would be
asked in. The reply must be one JSON object with exactly two keys; anything else is refused and the reviewed
fallback stands in.

**What is never sent:** the provider key never leaves the server, no user text is logged, and no request or
response body is ever written to a log. The only server-side record is a content-free category (reason, key
*names*, question ids, mode).

## Environment variables

Copy `.env.example` to `.env.local` and fill in what your environment needs. **Names only - never commit
values.**

| variable | purpose |
|---|---|
| `MODEL_MODE` | `live` uses the external provider; **anything else (or unset) is mock**, which makes no external request at all |
| `BASETEN_API_KEY` | server-side only, never `NEXT_PUBLIC_`; the credential for the configured model |
| `BASETEN_BASE_URL` | optional; defaults to `https://inference.baseten.co/v1`, and any host that is not the provider's own is refused |
| `BASETEN_MODEL` | optional; the model identifier the provider issued for this access |
| `BASETEN_TIMEOUT_MS` | optional; defaults to `20000`, accepted range 1000-120000 |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the hosted Supabase pair, required together for accounts and the saved journal |
| `SOMAMAP_LOCAL_SUPABASE_URL` / `SOMAMAP_LOCAL_ANON_KEY` | optional local-stack pair; must be loopback and carry the local demo issuer, or the resolver refuses |

The Supabase resolver (`src/lib/supabaseTarget.ts`) validates the pair and refuses to guess: a half pair, a
non-loopback "local" URL, or a local key paired with a hosted URL is a refusal, and the affected screens say
"not configured" rather than acting on a project nobody chose.

## Local setup

```bash
npm install
cp .env.example .env.local     # then fill in the names above
npm run dev                    # http://localhost:3000
```

With `MODEL_MODE` unset the app runs in **mock** mode: the interview uses the recorded question sequence and
the card is worded from your own answers, with no external request of any kind.

## Testing

```bash
npm run test:unit      # unit suite (node --test)
npm test               # red-team pack + unit suite
npm run lint           # eslint
npx tsc --noEmit       # type check
npm run build          # production build
```

The red-team pack covers: crisis screening before any wording, advice injection, extra-field attacks, prompt
injection, the copy scan for prohibited words, the question-bank audit, and the delete-everything evidence.

## Deployment

Deploy on Vercel with the environment variables above set for the environment you are deploying. Set
`MODEL_MODE=live` **and** the provider key together: live mode without a usable key makes no request at all
and falls back to the reviewed card, which is safe but is not live inference. `/settings` shows which of the
three states a deployment is in (mock, live ready, live refused), and a live card that had to use SomaMap's
own wording says so on the card.

## Data handling, consent, and privacy

- **Before anything is sent**, the check-in flow shows a disclosure naming the provider and the exact words
  that travel, and requires an explicit acknowledgement. The server refuses any turn that does not carry the
  acknowledgement its own disclosure asked for.
- **A check-in needs no account.** Without one, a finished card goes into the browser tab's own storage
  (`sessionStorage`) - never to the database - and the screen says plainly that it is not saved anywhere
  else and goes when the tab closes. Signing in is how you keep a journal.
- **Nothing is written to a database** for a signed-out visitor: the interview route touches no database at
  all.
- **Moving in-session cards into an account happens only when you say yes**, one card at a time, and a
  partial failure leaves the rest where they were.
- **No claim is made about what a provider does with the words afterwards** - no retention, deletion,
  training, storage or location statement appears anywhere in this build, because none of it has been
  independently verified.

## Safety boundaries

1. **Schema lock** - a card has exactly five fields; no advice, cause, interpretation or insight field
   exists, and a reply carrying one becomes the reviewed fallback.
2. **Texture, not triage** - every question is reviewed copy and asks only about a sensation's feel and
   shape; no clinical provocations, no implied causes or conditions.
3. **Patterns are vocabulary, not conditions** - the journal counts the user's own words and says nothing
   about what they mean.
4. **Crisis handling is numbers, not triage** - explicit crisis language stops the loop at a static screen
   with crisis lines, and saves nothing. The trigger is language, never a pattern of sensations.
5. **No advice or medical claims** - and when in doubt, the product is less helpful.

## Known limitations

- The fixed disclaimer line sits below the fold on phone widths; it is rendered on every screen at every
  viewport and is one swipe away.
- The body map's smallest zones are below the 44x44 px touch-target guideline on a phone; the region is
  always editable as free text.
- No shipped question asks how long a sensation lasted, so that row is usually empty and is hidden rather
  than shown as a missing answer.
- The in-session journal lives in one browser tab and does not follow you to another.
- The public-demo guard's in-memory counters are an abuse deterrent, **not** a spend ceiling: a deployment
  that scales to many instances can serve many times the limit, and a cold start resets it. A real ceiling
  belongs to the platform's own rate limiting and the provider's quota controls.

## Provider attribution

The live integration calls a Meta model served through **Baseten** (`https://inference.baseten.co/v1`),
using the OpenAI-compatible chat-completions API and the model identifier the provider issued for this
access. No model is hard-coded beyond that configured default, and no provider terms are restated here:
operators deploying this project are responsible for complying with the terms of the provider they configure
and of the model they select.

## License

MIT - see [LICENSE](./LICENSE).

## Project documentation

- `BUILD-REPORT.md` - the full build record: every entry, what was verified, and what is known not to work.
- `docs/mvp/` - scope, traceability, release readiness, the UAT register, and the issues and blockers log.

