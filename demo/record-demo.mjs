import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Records the SomaMap guest journey on the deployed application.
 *
 * What it is for: a real, silent screen recording of the production app, so the demo video only needs
 * narration. It drives the same journey a judge can try - landing, a guest check-in, the sensation card, and
 * the journal - and it never signs in, never types a credential and never touches a database row: a guest
 * check-in keeps its card in the browser tab's own storage, which is the product's own design.
 *
 * Requirements (nothing is added to package.json):
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *   node demo/record-demo.mjs
 *
 * Output:
 *   demo/somamap-demo.webm      the recording
 *   demo/recordings/shots/*.png one screenshot per beat, for review and as stills for the edit
 *   demo/recordings/run-log.txt what happened at each step, including any retry
 *
 * The demo data is fictional and deliberately unremarkable. The app is the real thing: the interview calls
 * the live model, so each question takes five to sixteen seconds and the recording keeps that time.
 */

const BASE = process.env.SOMAMAP_BASE ?? "https://somamap-ebon.vercel.app";
const VIDEO = "demo/somamap-demo.webm";
const SHOTS = "demo/recordings/shots";
const LOG = "demo/recordings/run-log.txt";
const VIEWPORT = { width: 1280, height: 800 };

/** The demonstration content: fictional, plain, and nothing about anyone's health. */
const LOCATION = "head";
const DESCRIPTION = "Heavy, like something pressing down. It has been there since this morning.";
const ANSWERS = ["heavy", "steady", "a heavy blanket"];

const lines = [];
function note(message) {
  const line = `${new Date().toISOString()} ${message}`;

  lines.push(line);
  console.log(line);
}

mkdirSync(SHOTS, { recursive: true });

/**
 * Launches a browser, whichever of the two Chromium builds this machine actually has.
 *
 * Playwright's headless mode uses its own headless shell build, which is a separate download; when only the
 * full browser is present, `channel: "chromium"` runs that one headlessly instead. Both produce the same
 * recording, so the script does not care which it gets.
 */
async function launchChromium() {
  try {
    return await chromium.launch();
  } catch (error) {
    note(`headless shell unavailable (${error.message.split("\n")[0]}); using the full Chromium build`);

    return chromium.launch({ channel: "chromium" });
  }
}

const browser = await launchChromium();
const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: "demo/recordings", size: VIEWPORT },
});

const page = await context.newPage();
page.setDefaultTimeout(45_000);

let step = 0;
async function shot(name) {
  step += 1;

  const file = `${SHOTS}/${String(step).padStart(2, "0")}-${name}.png`;

  await page.screenshot({ path: file });
  note(`screenshot ${file}`);
}

/** A pause that the edit will cut, so the model's thinking time is visible rather than hidden. */
async function hold(ms) {
  await page.waitForTimeout(ms);
}

async function clickIfPresent(name, timeout = 3000) {
  try {
    await page.getByRole("button", { name }).first().click({ timeout });

    return true;
  } catch {
    return false;
  }
}

try {
  // 1. The landing page, held long enough for the hero to be read on camera.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Finding the words is another matter", { timeout: 30_000 });
  note(`landing page loaded: ${BASE}`);
  await shot("landing");
  await hold(3500);

  // 2. A guest check-in: no account, no sign-in, nothing saved on a server.
  if (!(await clickIfPresent("Start describing"))) {
    await page.goto(`${BASE}/checkin`, { waitUntil: "domcontentloaded" });
  }

  await page.waitForSelector("text=Where do you feel it?", { timeout: 30_000 });
  note("check-in opened as a guest");
  await shot("checkin");
  await hold(2500);

  // 3. The region, tapped on the fixed body map.
  if (!(await clickIfPresent("Region head"))) {
    await page.getByLabel("Where you feel it").fill(LOCATION);
  }

  note("region named: head");
  await hold(1500);

  // 4. The description, in the person's own words.
  await page.getByLabel("Anything you want to put into words").fill(DESCRIPTION);
  note("description typed");
  await shot("description");
  await hold(2500);

  await clickIfPresent("Continue");
  await hold(1200);

  // 5. The disclosure, before anything leaves the app.
  await page.waitForSelector("text=A note about your words", { timeout: 30_000 });
  note("disclosure shown");
  await shot("disclosure");
  await hold(3500);

  if (!(await clickIfPresent("Continue with AI"))) {
    await clickIfPresent("Continue without AI");
    note("the disclosure offered only the local wording; continued without the model");
  } else {
    note("acknowledged external processing");
  }

  /**
   * Waits until one of the given sentences is on screen, and uses the app's own retry when a turn fails.
   *
   * The interview calls a reasoning model, so a turn takes five to sixteen seconds; this waits for the state
   * rather than guessing a duration, and when the app reports that a question could not be loaded it presses
   * the app's own Try again, because that is a real behaviour a judge would meet too.
   */
  async function waitForNext(sentences, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const body = await page.innerText("body");

      if (sentences.some((sentence) => body.includes(sentence))) return body;

      if (body.includes("could not be loaded")) {
        note("the app reported a failed turn; pressing its own Try again");
        await clickIfPresent("Try again");
      }

      await page.waitForTimeout(1000);
    }

    return null;
  }

  // 6. The interview: three questions, each one the model's own choice from the reviewed bank.
  for (let question = 1; question <= 3; question += 1) {
    const shown = await waitForNext([`Question ${question} of 3`]);

    if (shown === null) throw new Error(`question ${question} never appeared`);

    note(`question ${question} of 3 on screen`);
    await shot(`question-${question}`);
    await hold(2000);

    // The offered words live behind the app's own expander; open it as a person would, then tap one.
    const expander = page.locator("summary", { hasText: "Try a word" });

    if ((await expander.count()) > 0) {
      await expander.first().click();
      await hold(1500);
      note(`question ${question}: opened the word suggestions`);
    }

    const offered = page.locator('button[aria-label^="Add "]:visible');

    if ((await offered.count()) > 0) {
      const label = await offered.first().getAttribute("aria-label");

      await offered.first().click();
      note(`question ${question}: tapped the offered word (${label})`);
    } else {
      await page.locator("#interview-answer").fill(ANSWERS[question - 1]);
      note(`question ${question}: typed an answer, because no words were offered`);
    }

    await hold(1500);
    await clickIfPresent("Continue");
    note(`answered question ${question}`);
  }

  // 7. The card: five fields, and the person's own sentence as the largest thing on it.
  if ((await waitForNext(["Your card"], 120_000)) === null) throw new Error("the card never appeared");

  note("card generated");
  await shot("card");
  await hold(6000);

  // 8. The journal, still as a guest: this is the difference the narration explains.
  await page.goto(`${BASE}/journal`, { waitUntil: "domcontentloaded" });

  const journal = await waitForNext(["in this browser tab", "No cards yet", "Your journal for now"], 45_000);

  if (journal === null) throw new Error("the journal never appeared");

  note("guest journal on screen");
  await shot("journal-guest");
  await hold(3000);

  // Scroll so the journal's own sentence about what it is holding is legible on camera.
  await page.mouse.wheel(0, 500);
  await hold(3500);
  await shot("journal-guest-scrolled");
  await hold(1500);

  note("journey complete");
} catch (error) {
  note(`STOPPED: ${error.message}`);
  process.exitCode = 1;
} finally {
  // The video is only written when the context closes, so this happens whatever the outcome.
  const video = page.video();

  await context.close();

  if (video !== null) {
    await video.saveAs(VIDEO);
    note(`recording saved: ${VIDEO}`);
  }

  await browser.close();

  const { writeFileSync } = await import("node:fs");

  writeFileSync(LOG, `${lines.join("\n")}\n`, "utf8");
  console.log(lines.join("\n"));
}



