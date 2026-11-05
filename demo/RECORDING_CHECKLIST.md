# SomaMap — recording checklist

**A recording already exists:** `demo/somamap-demo.webm` (1:27.56, silent, made by `demo/record-demo.mjs`
against the production app). If it is good enough, skip to section 6 and use
`demo/VOICEOVER_GUIDE.md` for the timings. Everything below is for recording your own version, with your own
narration, in a browser you control.

Work down this list in order. Nothing here requires access to Vercel or Supabase.

## 1. Before you start (5 minutes)

- [ ] **Use the production URL:** `https://somamap-ebon.vercel.app` — this is the deployment whose core
      journey you have already verified end to end.
- [ ] **Open a private/incognito window** and use it for the whole recording. This is not only for tidiness:
      it gives you a clean profile with no saved passwords, so nothing autofills over your typing, and it
      keeps your personal browsing and accounts out of frame.
- [ ] **Close every other tab and window.** One tab, one window.
- [ ] **Turn on Focus assist / Do not disturb** (Windows: Settings → System → Focus). A single notification
      in the middle of the interview means re-recording.
- [ ] **Have the demo account's credentials to hand on paper or in a notes app**, so you can type them
      without a password manager popup appearing on camera.
- [ ] **Silence your phone** and put it out of frame.
- [ ] **Decide your narration method:** speak live while recording (simplest, and it keeps the timing
      honest), or record silently and narrate in the edit (easier to get the words right). The script fits
      both.

## 2. Demo account and test data

- [ ] **Sign in with the working demo account** — the one you created and verified (a new account created
      during this hackathon). Do not use the original account whose sign-in is unresolved.
- [ ] **Do not create or delete anything else.** The recording needs one saved card; it already exists.
- [ ] **Test data for the live check-in** (fictional, innocuous, and safe to show a judge):
      - region: **head**
      - description: `Heavy, like something pressing down. It has been there since this morning.`
      - answers: tap the words the app offers, or type two or three words of your own
- [ ] **Never type a real address, a real name, or anything about your own health.** The card you already
      saved uses "heavy" and "head", which is exactly the right register: plain, fictional, unremarkable.
- [ ] **Never let the password field's contents be visible.** Type the password, then move on; if a
      "save password?" prompt appears, dismiss it before continuing.

## 3. Browser setup

- [ ] Window size **1440×900 or larger**, browser maximised, **bookmarks bar hidden** (Ctrl+Shift+B),
      zoom at **100%**.
- [ ] **One beat at phone width** so the mobile-first experience is visible: drag the window to roughly
      **390 px wide** for a few seconds on the check-in screen (the body map and the card are the screens
      worth showing narrow). Do **not** open DevTools' device toolbar — that puts developer chrome on camera.
      If you have a phone, a short screen recording of the same check-in is an even better insert.
- [ ] Confirm the fixed line is visible on screen:
      *"SomaMap is a vocabulary and journaling tool. It does not interpret sensations or give medical
      advice."* It sits at the foot of every screen; do not crop it out of the final shot.

## 4. Recording settings

- [ ] **Record the browser window only**, not the whole desktop — this keeps the taskbar, clock and any
      notification popups out of frame.
- [ ] **1920×1080 or 1440×900, 30 fps.** Higher is unnecessary and slows the upload.
- [ ] **Include audio** if you are narrating live; set the microphone level so the narration is clearly above
      the keyboard noise.
- [ ] **A tool that is already on Windows** is enough: **Snipping Tool → Record** (Win+Shift+S, then the
      video button), or **Xbox Game Bar** (Win+G → Record). OBS is fine if you already use it. Nothing needs
      to be installed.
- [ ] **Do one 15-second test take** and play it back before the real run: check the audio level, the frame,
      and that no notification appeared.

## 5. The take

- [ ] Follow `DEMO_STORYBOARD.md` scene by scene. The interview's thinking pauses are expected — the model is
      a reasoning model and takes five to sixteen seconds per question. Keep recording; the edit removes them.
- [ ] If a question fails to load, the app says so honestly and offers **Try again** — use it, and keep
      recording. That is a real product behaviour, not a failure of the demo.
- [ ] If you fluff a line, pause for three seconds and say it again from the start of that scene. It is
      easier to cut than to restart.

## 6. Final review before uploading

- [ ] **Length:** 90–120 seconds after cutting the thinking time. If it is longer, cut the refresh beat and
      the consent sentence first.
- [ ] **No secrets on screen:** no password text, no saved-password popup, no Vercel/Supabase dashboard, no
      DevTools, no personal email address.
- [ ] **No medical claims in the narration:** no "diagnose", "treat", "symptom", "condition", and nothing
      implying the app knows what a sensation means.
- [ ] **The fixed disclaimer line appears at least once**, and the journal's own note — *"Counted from the
      words on your own cards, and nothing else. SomaMap does not read them."* — is legible in the journal
      shot.
- [ ] **Audio is intelligible** at normal volume with no clipping.
- [ ] **The card and the journal show the same saved card**, and the journal is shown **after a refresh**, so
      the persistence is visible rather than asserted.
- [ ] Upload it somewhere the submission form accepts (unlisted YouTube is the usual choice), then paste the
      link into the submission — and check the link opens in a private window.
