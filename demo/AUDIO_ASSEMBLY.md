# Adding your voice to the demo — the fastest way, and what I can do for you

## What I built for you (verified)

| file | what it is |
|---|---|
| `demo/somamap-demo-narration-cues.mp4` | **the demo video with each narration line drawn on screen at the moment it belongs to** — 1:27.56, verified by extracting a frame at 0:31 and reading it |
| `demo/somamap-demo.mp4` | the clean recording in MP4 (1:27.56), for uploading or editing |
| `demo/somamap-demo.webm` | the original recording |

The cue timings come from the recording's own run log, so they match what is on screen. Rebuild either file
any time with `node demo/build-narration-cues.mjs` (needs a full ffmpeg — the one at `C:\ffmpeg\bin` has
`drawtext` and `libx264`; Playwright's bundled ffmpeg is video-only and cannot do this).

**I cannot record or clone your voice.** There is no microphone, no text-to-speech and no voice-cloning tool
in this environment, and I will not pretend otherwise. But your own voice is the best match anyway, and I can
do every other step.

## Path A — the fastest (about 10 minutes, no editing at all)

1. Open **`demo/somamap-demo-narration-cues.mp4`** and play it full screen (or in a window you can record).
2. Start a screen recording **with your microphone on**:
   - **Snipping Tool** → Win+Shift+S → the **video** button → turn the **microphone** on, or
   - **Xbox Game Bar** → Win+G → Record (check the mic is enabled in its audio settings).
3. **Read each line aloud as it appears** at the bottom of the video. When the line changes, move on; when
   there is no line, stay quiet and let the app breathe.
4. Stop, then play it back once. That recording **is** your submission video — audio and picture already
   together, in sync, because they were captured together.

This is the method I would use: the burned-in lines remove the need to memorise anything or to match a
separate audio file to a timeline.

## Path B — best audio quality, and I finish it for you

1. Play the cue video and record **audio only** while you read:
   - Windows **Sound Recorder / Voice Recorder** app, or any recorder you like.
2. Save the file into this workspace as **`demo/voiceover.m4a`** (`.wav` and `.mp3` are fine too).
3. **Tell me, and I will mux it** with this exact command — no guessing, no editing:

```
C:\ffmpeg\bin\ffmpeg.exe -y -i demo\somamap-demo.webm -i demo\voiceover.m4a ^
  -map 0:v -map 1:a -c:v libx264 -crf 22 -pix_fmt yuv420p -c:a aac -b:a 160k ^
  -shortest -movflags +faststart demo\somamap-demo-with-voice.mp4
```

If your take runs a little long or short, I can also pad, trim or shift it to line up — just say the word.

## Path C — record the whole demo yourself, live

If you would rather narrate a fresh run of the app in one take (the most natural result of all), use
`demo/RECORDING_CHECKLIST.md` for the setup and `demo/DEMO_STORYBOARD.md` for the shots. Nothing needs to be
matched afterwards, because the narration happens while the app is on screen.

## One thing worth knowing

Because the demo is a **screen recording**, nothing has to be lip-synced: a line can start a second early or
late and still look right. So do not chase precision — read the lines as they appear and it will land.

## If you want the narration in a synthetic voice that sounds like you

That needs a voice-cloning service, which is not something this environment can do — no such tool and no
credentials for one. Your own recording will sound more natural than a clone in any case, and Path A makes it
a ten-minute job.
