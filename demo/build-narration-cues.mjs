import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Builds two files from the silent demo recording:
 *
 *   1. demo/somamap-demo-narration-cues.mp4 - the same video with each narration line drawn on screen at
 *      the moment it belongs to. Play it, read aloud, and the timing matches without any editing.
 *   2. demo/somamap-demo.mp4                - the clean recording in MP4, for uploading or for an editor.
 *
 * The cue times come from the recording's own run log (`demo/recordings/run-log.txt`), so they match what is
 * on screen rather than a plan. Text is sanitised for ffmpeg's drawtext filter (no colon, comma or
 * apostrophe), which is why the lines read slightly differently from the spoken script.
 *
 * Requires a full ffmpeg (the one at C:\ffmpeg\bin has drawtext and libx264; Playwright's bundled build is
 * video-only and cannot do this).
 */

const FFMPEG = process.env.FFMPEG ?? "C:/ffmpeg/bin/ffmpeg.exe";
const SOURCE = "demo/somamap-demo.webm";
const CUED = "demo/somamap-demo-narration-cues.mp4";
const CLEAN = "demo/somamap-demo.mp4";
const FONT = "C\\:/Windows/Fonts/arial.ttf";

/** [seconds on the video, what to say] - read from the run log's timestamps. */
const CUES = [
  [2, "You know what you feel. Finding the words is another matter."],
  [9, "You can use SomaMap without an account. This is a guest journey."],
  [11, "I tap where I feel it - the head."],
  [13, "And I describe it in my own words."],
  [17, "Before anything leaves the app, it says what will be sent. Then I choose."],
  [22, "The model chooses which of SomaMap's own reviewed questions comes next."],
  [30, "The wording is never written by the model. It selects from a fixed bank."],
  [33.5, "It offers a few plain words. I can tap one, or keep my own."],
  [48, "Every question is about how it feels, never about what it means."],
  [60, "The last question is always the comparison."],
  [64, "And I choose the words that fit."],
  [71, "That is the card. Five fields, and my own sentence as the largest thing on it."],
  [79, "As a guest, my card is held in this browser tab. The app says so."],
  [82, "The words I chose, and the places I named. Counts of my own words, nothing else."],
  [85, "Signing in is what keeps a card. That is the only difference."],
  [86.5, "No diagnosis, no interpretation, no advice. Just your own words, kept."],
];

/** drawtext cannot carry these characters without escaping, so the overlay avoids them. */
function safe(text) {
  return text.replace(/[:,'\\%]/g, " ").replace(/\s+/g, " ").trim();
}

function cueFilters() {
  return CUES.map(([start, line], index) => {
    const end = index + 1 < CUES.length ? CUES[index + 1][0] : 999;

    return [
      "drawtext",
      `=fontfile='${FONT}'`,
      `:text='${safe(line)}'`,
      ":fontsize=26",
      ":fontcolor=white",
      ":box=1",
      ":boxcolor=black@0.62",
      ":boxborderw=14",
      ":x=(w-text_w)/2",
      ":y=h-text_h-40",
      `:enable='between(t,${start},${end})'`,
    ].join("");
  }).join(",");
}

if (!existsSync(SOURCE)) throw new Error(`missing ${SOURCE}`);
if (!existsSync(FFMPEG)) throw new Error(`missing ffmpeg at ${FFMPEG} - set FFMPEG to a full build`);

console.log(`ffmpeg: ${FFMPEG}`);
console.log(`building ${CUED} (narration cues burned in)...`);

execFileSync(
  FFMPEG,
  ["-hide_banner", "-loglevel", "error", "-y", "-i", SOURCE, "-vf", cueFilters(), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", CUED],
  { stdio: "inherit" },
);

console.log(`building ${CLEAN} (clean MP4)...`);

execFileSync(
  FFMPEG,
  ["-hide_banner", "-loglevel", "error", "-y", "-i", SOURCE, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", CLEAN],
  { stdio: "inherit" },
);

console.log("done");
