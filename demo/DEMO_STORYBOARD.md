# SomaMap — demo storyboard (screen actions, narration, timing)

Target: **90–120 seconds** final cut. The official event page specifies no video length, so this is the
target. Timing below is the *recorded* timeline; the **edit points** are where the model's thinking time is
cut away, which is what keeps a live session inside the target.

All screen labels below are the app's real strings (verified against the deployed build).

| # | time | screen | action | narration (see `DEMO_SCRIPT.md`) | transition |
|---|---|---|---|---|---|
| 1 | 0:00–0:12 | Landing `somamap-ebon.vercel.app` | none — let the hero sit | "You know what you feel. Finding the words is another matter." → the problem | hold, no scroll |
| 2 | 0:12–0:22 | Landing | one slow scroll to the "How it works" steps | what SomaMap is; the fixed line is on screen | click **Start describing** |
| 3 | 0:22–0:32 | Check-in — "Where do you feel it?" / "Tap the body map, or type where it is." | click the **head** on the body map | "I tap where I feel it — the head." | keep |
| 4 | 0:32–0:40 | Check-in — "Anything you want to put into words" | type the demonstration sentence (see `RECORDING_CHECKLIST.md`) | "and I describe it in my own words" | click **Continue** |
| 5 | 0:40–0:48 | Consent — "A note about your words" | pause so the disclosure is readable | "Before anything leaves the app, it tells me what will be sent and to whom, and I choose." | click **Continue with AI** |
| 6 | 0:48–1:00 | Interview — "Question 1 of 3", "Your answer", words offered under "Not sure how to describe it? Try a word" | tap one offered word, then **Continue** | "the model chooses which approved question to ask next; I can tap a word or type my own" | **EDIT: cut the thinking time** |
| 7 | 1:00–1:12 | Interview — "Question 2 of 3" | answer in a few words, **Continue** | (silence, or one short line about the questions being about feel and shape) | **EDIT: cut the thinking time** |
| 8 | 1:12–1:22 | Interview — "Question 3 of 3": the comparison question | answer, **Continue** | "the last question is always the comparison — that is where the most useful words are" | "Putting your card together..." |
| 9 | 1:22–1:34 | Card — "Your card" | none; move the mouse away | the five fields; the user's sentence is the largest thing on the card; no field for meaning exists | **EDIT: cut the save wait** |
| 10 | 1:34–1:46 | Sign-in `somamap-ebon.vercel.app/sign-in` | sign in with the demo account | "An account is what keeps a card." | lands on the journal |
| 11 | 1:46–2:00 | Journal — "Your journal" | point at the saved card, then the counts under "Words you chose" and "Places you named" | "counts of my own words, and the journal says so: 'Counted from the words on your own cards, and nothing else. SomaMap does not read them.'" | press **F5** / refresh |
| 12 | 2:00–2:08 | Journal after refresh | let the reload finish and the card reappear | "Still there. It is saved, not remembered by the tab." | cut |
| 13 | 2:08–2:20 | Landing or card | none | the boundaries close: no diagnosis, no interpretation, no advice — just your own words, kept | end card |

**Recorded runtime ≈ 2:20. With the three edit points cut, the finished video is ≈ 1:45.** Cut one more beat
(the refresh at 2:00, which is visible anyway) and it lands at **≈ 1:35**, inside the 90–120 second target
with room to breathe. The narration from `DEMO_SCRIPT.md` is written to fit that shorter cut.

## Rules for the recording

- **One take of the live session.** Do not fake the model: if a question takes fifteen seconds, record it and
  cut it in the edit.
- **Never show:** the password field's contents, a real email address, the browser's saved-password popup,
  DevTools, the Vercel or Supabase dashboards, or any notification.
- **Always show:** the fixed disclaimer line at least once (it is on every screen, so this is automatic if you
  do not crop it), and the journal's own note about counting words.
- **The crisis screen is deliberately not part of the demo.** It exists and is verified, but showing it means
  typing crisis language on camera; mention the boundary in narration instead. If a judge asks, the answer is
  in `BUILD-REPORT.md` (Entry 33 and the red-team pack's T1/T4 rows).
