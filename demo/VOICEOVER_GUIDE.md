# SomaMap — timestamped voiceover guide

For `demo/somamap-demo.webm` — a real, **silent** recording of the deployed app, driven end to end by
`demo/record-demo.mjs`. Verified: **1:27.56, VP9, 1280×800, 25 fps, 5.4 MB**.

The timestamps below are read from the recording's own run log (`demo/recordings/run-log.txt`), so they match
the video rather than a plan. Speak each line at its timestamp; the pauses are the live model thinking, and
they are the honest part of the demo — do not fill them.

| video time | what is on screen | say |
|---|---|---|
| **0:02** | Landing page | "You know what you feel. Finding the words is another matter." — that is the problem I built SomaMap for. |
| **0:09** | Check-in opens as a guest | You can use SomaMap without an account. This whole journey is a guest journey. |
| **0:11** | The body map, "head" tapped | I tap where I feel it: the head. |
| **0:13** | Description typed: *"Heavy, like something pressing down. It has been there since this morning."* | And I describe it in my own words, exactly as I would say it out loud. |
| **0:17** | "A note about your words" disclosure | Before anything leaves the app, it tells me what will be sent and to whom — and I choose. That is a click, not a checkbox buried in settings. |
| **0:21** | Acknowledged; the first question loads | SomaMap sends what I wrote to a Muse Spark Open model, which chooses which of its own reviewed questions to ask next. |
| **0:30** | "Question 1 of 3" — spot or spread | The wording is never written by the model: it selects from a fixed, reviewed bank. |
| **0:33** | The word suggestions open; *"in one spot"* tapped | It offers a few plain words. I can tap one, or keep my own. The screen says it plainly: suggestions only, nothing is added unless I tap it. |
| **0:48** | "Question 2 of 3" | Every question is about how it feels — never about what it means. |
| **1:00** | **"Question 3 of 3: What does it remind you of?"** | The last question is always the comparison, because that is usually where the most useful words are. |
| **1:04** | *"a tight knot"* tapped | And I choose the words that fit. |
| **1:11** | **"Your card"** — the five fields | That is the card. Five fields: where, the words I chose, what it feels like, how long, and my own sentence — which is the largest thing on the card, because it is the whole point. There is no field for what it might mean, because the schema has no such field. |
| **1:19** | **"Your journal"** — guest view | As a guest, my card is held in this browser tab, and the app says so: "It is not saved anywhere else, and it goes when the tab closes." |
| **1:22** | "1 saved card", "Words you chose", "Places you named" | And here is the counting: the words I chose, and the places I named. Counted from the words on my own cards, and nothing else — the journal says SomaMap does not read them. |
| **1:25** | Journal scrolled to the saved card | **Signing in is what keeps a card.** That is the only difference between guest use and an account — the same card, saved to a journal you can come back to. |
| **1:27** | end | No diagnosis, no interpretation, no advice — just your own words, kept. SomaMap: find the words for what you feel. |

## Using this with the recording

- **Add the narration as an audio track** over the silent video, or record it as a voiceover pass while
  playing the file. Either is fine; the timings are generous enough for a calm read.
- **If you need to reach 90–120 seconds:** the video is 1:27, so the narration fits as written. If you add a
  spoken intro, cut the two model pauses (around 0:35–0:47 and 0:52–0:59) with a jump cut.
- **If you would rather record your own:** `demo/RECORDING_CHECKLIST.md` is the setup, and
  `demo/DEMO_STORYBOARD.md` is the shot list. This file then serves as the timing reference.
- **Never say** diagnose, treat, symptom, condition, or that SomaMap detects or identifies anything. The
  product's words are sensation, words, card, and journal.
