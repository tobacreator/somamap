/**
 * SomaMap visual harness - Phase 2.0 of the approved body-map plan.
 *
 * What this is. A standalone, dependency-free browser harness. It drives the *production* build of
 * the app in the Chrome already cached on this machine, over the DevTools Protocol, using nothing
 * but Node's built-in `fetch` and `WebSocket`. It measures the live DOM, captures screenshots, and
 * evaluates a named set of acceptance gates, then writes one machine-readable report and one human
 * summary.
 *
 * Why it exists. The Phase 1 feedback loop produced 30 failures in four families (zones smaller
 * than 44x44, map units rendered 1.60x taller than they are wide, controls under 44px, and the
 * fixed line below the fold). Every later phase of the body-map plan is judged against those
 * families plus the alignment gates (L1/L2/L3) that decide whether the drawn silhouette and the
 * fixed zone map actually agree. Those judgements must be measurements, not opinions, so they are
 * encoded here once and re-run after every change.
 *
 * Rules this file obeys:
 *   - dependency-free: Node built-ins only, and it launches the cached Chrome itself;
 *   - standalone: not referenced by package.json, not part of `npm test`, not part of the
 *     red-team pack. Run it by hand: `node tools/visual-harness/run.mjs`;
 *   - writes nothing inside the repository: screenshots, the JSON report and Chrome's throw-away
 *     profile all live under %TEMP% (override with SOMAMAP_OUT);
 *   - read-only against the app: it clicks, types and scrolls, but every /api call it makes is one
 *     the app would make for a real user, and it never touches .env.local, a database or Storage;
 *   - it is a harness, so it can fail. `--self-test` mutates the live page and asserts that the
 *     gates it is meant to detect actually flip to FAIL. A harness that cannot fail proves nothing.
 *
 * Usage:
 *   node tools/visual-harness/run.mjs               # full sweep against SOMAMAP_BASE
 *   node tools/visual-harness/run.mjs --self-test   # gate-mechanics check only
 *   node tools/visual-harness/run.mjs --quick       # one viewport, no journey
 *
 * Environment:
 *   SOMAMAP_BASE       default http://127.0.0.1:3311   (the production server to drive)
 *   SOMAMAP_CDP_PORT   default 9228                    (Chrome's debugging port)
 *   SOMAMAP_OUT        default %TEMP%\somamap-phase2   (screenshots + report; never the repo)
 *   SOMAMAP_CHROME     default the cached Chrome under ~/.cache/puppeteer
 *   SOMAMAP_KEEP_CHROME=1                              (leave the launched Chrome running)
 *
 * Exit code: 0 when every gate passes, 1 when any gate fails, 2 when the run could not start
 * (no server, no Chrome). A failure is reported, never suppressed.
 */

import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ configuration */

const HERE = dirname(fileURLToPath(import.meta.url));
/** The repository root, derived from this file's own location - never hard-coded. */
const REPO = resolve(HERE, "..", "..");

const BASE = process.env.SOMAMAP_BASE ?? "http://127.0.0.1:3311";
const CDP_PORT = Number(process.env.SOMAMAP_CDP_PORT ?? 9228);
const CDP = `http://127.0.0.1:${CDP_PORT}`;
const OUT = process.env.SOMAMAP_OUT ?? join(tmpdir(), "somamap-phase2");
const PROFILE = join(OUT, "chrome-profile");
const SELF_TEST = process.argv.includes("--self-test");
const QUICK = process.argv.includes("--quick");

mkdirSync(OUT, { recursive: true });

/** Iron rule 5's fixed line, as the user must see it on every screen. */
const DISCLAIMER =
  "SomaMap is a vocabulary and journaling tool. It does not interpret sensations or give medical advice.";

/**
 * The external model provider's id, as the client sends it when the build is in live mode, and the id
 * it sends when it is not. The gates below assert that the disclosure on screen matches the mode the
 * server is in, and that every interview request carries the acknowledgement that mode asked for.
 */
const PROVIDER_ID = "baseten";

/** The request field the acknowledgement travels in (Phase 2D). */
const ACKNOWLEDGED_PROVIDER_FIELD = "acknowledgedProvider";

/**
 * Which mode this run expects the server to be in, and therefore which disclosure and which
 * acknowledgement are correct (Phase 2D follow-up). It defaults to the shipped default, mock mode:
 * `SOMAMAP_EXPECT_MODE=live node tools/visual-harness/run.mjs` is how a live-mode server is checked.
 *
 * The expectations are written out per mode rather than shared, because that is the whole point of the
 * follow-up: the mock build must not claim anything is sent to Baseten, and the live build must say
 * plainly that the description, the region and the answers are sent there and may be sent again.
 */
const EXPECTED_MODE = process.env.SOMAMAP_EXPECT_MODE === "live" ? "live" : "mock";

const EXPECTED =
  EXPECTED_MODE === "live"
    ? {
        acknowledge: PROVIDER_ID,
        must: [/Baseten/, /description/i, /location/i, /answers/i, /are sent to Baseten/i, /sent again/i],
        mustNot: [/no external provider/i],
      }
    : {
        acknowledge: "local",
        must: [/no external provider/i, /not sent to Baseten/i],
        mustNot: [/are sent to/i, /may be sent again/i],
      };

/** Iron rule 5's prohibited stems. Matched case-insensitively against rendered text. */
const PROHIBITED = ["symptom", "diagnos", "treatment", "indicat"];

/** WCAG 2.1 AA: 4.5:1 for normal text. */
const TEXT = 4.5;
/** WCAG 2.1 AA: 3:1 for graphical objects and user-interface components. */
const NON_TEXT = 3;

/** The smallest screen the plan names. 320x568 is the gate A4 must survive. */
const SMALLEST = { name: "320x568", width: 320, height: 568, dsf: 2, mode: "light" };

/** The viewport sweep. Every one is measured in both colour schemes. */
const VIEWPORTS = QUICK
  ? [SMALLEST]
  : [
      SMALLEST,
      { name: "320x800", width: 320, height: 800, dsf: 2, mode: "light" },
      { name: "320x800", width: 320, height: 800, dsf: 2, mode: "dark" },
      { name: "360x640", width: 360, height: 640, dsf: 3, mode: "light" },
      { name: "390x844", width: 390, height: 844, dsf: 2, mode: "light" },
      { name: "390x844", width: 390, height: 844, dsf: 2, mode: "dark" },
      { name: "430x932", width: 430, height: 932, dsf: 2, mode: "light" },
      { name: "768x1024", width: 768, height: 1024, dsf: 2, mode: "light" },
      { name: "1440x900", width: 1440, height: 900, dsf: 1, mode: "light" },
      { name: "1440x900", width: 1440, height: 900, dsf: 1, mode: "dark" },
    ];

/** The viewports the alignment sweep (L1/L2/L3) and the contrast pass run at. */
const ALIGN_AT = QUICK
  ? [SMALLEST]
  : [
      { name: "320x568", width: 320, height: 568, dsf: 2, mode: "light" },
      { name: "390x844", width: 390, height: 844, dsf: 2, mode: "light" },
      { name: "390x844", width: 390, height: 844, dsf: 2, mode: "dark" },
      { name: "1440x900", width: 1440, height: 900, dsf: 1, mode: "light" },
    ];

/** The views the plan names. `Side` is the third drawn view (A7/A8). */
const REQUIRED_VIEWS = ["Front", "Back", "Side"];
/** The figure variants the plan names (A7). */
const REQUIRED_FIGURES = ["Neutral", "Feminine", "Masculine"];

/* ------------------------------------------------------------- the gate registry */

const gates = [];
const consoleErrors = [];
const screenshots = [];
const measurements = {};
const notes = [];

/** Where `gate()` writes. Swapped for a scratch list by `--self-test`; see `withSink`. */
let sink = gates;

function gate(id, title, ok, detail) {
  const entry = { id, title, ok: Boolean(ok), detail: detail === undefined ? null : String(detail) };
  sink.push(entry);
  if (sink === gates) {
    console.log(`${ok ? "PASS" : "FAIL"}  [${id}] ${title}${detail === undefined ? "" : `  [${detail}]`}`);
  }
  return entry.ok;
}

/**
 * Route gates into a scratch list instead of the run's own. `--self-test` uses this to call the
 * real gate functions against a deliberately broken page and inspect what they said, which is the
 * only way to show that a gate can fail rather than merely that it can print.
 */
async function withSink(list, fn) {
  const previous = sink;
  sink = list;
  try {
    await fn();
  } finally {
    sink = previous;
  }
}

function note(text) {
  notes.push(text);
  console.log(`note  ${text}`);
}

const failureCount = () => gates.filter((g) => !g.ok).length;

/* -------------------------------------------------------------- the map space, from source */

/**
 * The coordinate spaces the fixed zone map is authored in, read from src/lib/regions.ts.
 *
 * The harness deliberately keeps no copy of these numbers: what a gate asserts is what the app
 * ships, so a change to the map space cannot leave a stale expectation behind. Since Phase 2.1 the
 * map declares one space per view (front and back share theirs), and the drawing declares which one
 * it used on the `<svg>` element itself - so `S3.mapspace` can check the rendered drawing against
 * the source of truth rather than against a guess.
 */
function readMapSpaces() {
  const source = readFileSync(join(REPO, "src", "lib", "regions.ts"), "utf8");
  const number = (name) => {
    const match = new RegExp(`export const ${name}\\s*=\\s*([0-9]+)`).exec(source);
    return match ? Number(match[1]) : null;
  };

  const spaces = [
    { name: "front/back", width: number("BODY_MAP_UNITS_X"), height: number("BODY_MAP_UNITS_Y") },
    { name: "side", width: number("SIDE_MAP_UNITS_X"), height: number("SIDE_MAP_UNITS_Y") },
  ];

  if (spaces.some((space) => space.width === null || space.height === null)) {
    throw new Error("regions.ts declares no per-view map space (BODY_MAP_UNITS_X/Y or SIDE_MAP_UNITS_X/Y)");
  }

  return spaces;
}

const MAP_SPACES = readMapSpaces();

/**
 * The light palette's two text colours, read from the stylesheet the browser receives.
 *
 * Every screen renders through `PaperPage`, whose class the stylesheet's pin reads, so the page a person
 * sees is the light palette in both colour schemes. The pin restates that palette in globals.css, and
 * `src/lib/contrast.ts` splits the same file on the same marker, so this keeps no copy of a colour: C8
 * asserts what the app ships rather than what a reviewer remembers.
 */
function readLightPalette() {
  const css = readFileSync(join(REPO, "src", "app", "globals.css"), "utf8");
  const marker = "@media (prefers-color-scheme: dark)";
  const at = css.indexOf(marker);
  const light = at === -1 ? css : css.slice(0, at);
  const value = (name) => {
    const match = new RegExp(`--color-${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(light);
    return match ? match[1] : null;
  };

  const paper = value("paper");
  const ink = value("ink");

  if (paper === null || ink === null) {
    throw new Error("globals.css declares no light --color-paper/--color-ink for the pinned palette");
  }

  return { paper, ink };
}

const LIGHT_PALETTE = readLightPalette();

/* ------------------------------------------------------------------ CDP plumbing */

let chrome = null;
let ws = null;
let nextId = 0;
const pending = new Map();
const postedBodies = [];
/**
 * Every `/api/` response the page received, so a gate can read the payload the route actually
 * validated rather than inferring it from the screen. `apiRequestIds` maps a request to its URL
 * until the response has finished loading, when the body is fetched.
 */
const apiResponses = [];
const apiRequestIds = new Map();

async function listTargets(attempts = 40) {
  let lastError = "no attempt made";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      if (Array.isArray(list) && list.some((t) => t.type === "page")) return list;
      lastError = `the endpoint returned ${JSON.stringify(list).slice(0, 120)}`;
    } catch (error) {
      lastError = `${error.message} (cause: ${error.cause?.code ?? error.cause?.message ?? "none"})`;
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  throw new Error(`could not list CDP targets at ${CDP}: ${lastError}`);
}

/** The cached Chrome this machine already has, found by pattern rather than by a hard-coded build. */
function findChrome() {
  if (process.env.SOMAMAP_CHROME) return process.env.SOMAMAP_CHROME;

  const root = join(homedir(), ".cache", "puppeteer", "chrome");

  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(root, entry.name, "chrome-win64", "chrome.exe");
      try {
        readFileSync(candidate);
        return candidate;
      } catch {
        /* not this one */
      }
    }
  } catch {
    /* no puppeteer cache on this machine */
  }

  throw new Error(
    `no cached Chrome found under ${root}. Set SOMAMAP_CHROME to a chrome.exe path, or start Chrome ` +
      `yourself with --remote-debugging-port=${CDP_PORT} and set SOMAMAP_CDP_PORT.`,
  );
}

function launchChrome() {
  const exe = findChrome();
  rmSync(PROFILE, { recursive: true, force: true });

  chrome = spawn(
    exe,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--mute-audio",
      "--window-size=1440,900",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  // Chrome is chatty on stderr. The harness never needs it, and must not leak it into the report.
  chrome.stderr.on("data", () => {});
  chrome.on("exit", () => {
    chrome = null;
  });

  return exe;
}

function stopChrome() {
  if (chrome && !process.env.SOMAMAP_KEEP_CHROME) {
    try {
      chrome.kill();
    } catch {
      /* already gone */
    }
    chrome = null;
  }
}

function connect(webSocketDebuggerUrl) {
  ws = new WebSocket(webSocketDebuggerUrl);

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const { resolve: done, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else done(message.result);
      return;
    }

    if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push(`exception: ${String(message.params?.exceptionDetails?.text ?? "unknown")}`);
    }

    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      const text = (message.params.args ?? [])
        .map((arg) => String(arg.value ?? arg.description ?? ""))
        .join(" ")
        .slice(0, 160);
      consoleErrors.push(`console.error: ${text}`);
    }

    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
      consoleErrors.push(`log: ${message.params.entry.text.slice(0, 160)}`);
    }

    if (message.method === "Network.requestWillBeSent" && message.params.request.url.includes("/api/")) {
      postedBodies.push({ url: message.params.request.url, postData: message.params.request.postData ?? null });
    }

    if (message.method === "Network.responseReceived" && message.params.response.url.includes("/api/")) {
      apiRequestIds.set(message.params.requestId, message.params.response.url);
    }

    // The body is only readable once the response has finished; a failure is recorded rather than
    // swallowed, so a gate that depends on the payload reports why it could not read it.
    if (message.method === "Network.loadingFinished" && apiRequestIds.has(message.params.requestId)) {
      const requestId = message.params.requestId;
      const url = apiRequestIds.get(requestId);
      apiRequestIds.delete(requestId);

      send("Network.getResponseBody", { requestId })
        .then((body) => apiResponses.push({ url, body: body?.body ?? "" }))
        .catch((error) => apiResponses.push({ url, body: "", error: String(error?.message ?? error) }));
    }
  });

  return new Promise((done, reject) => {
    ws.addEventListener("open", done, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
}

function send(method, params = {}) {
  return new Promise((done, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve: done, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }

  return result.result.value;
}

/* ------------------------------------------------------------- page-driving helpers */

const bodyText = () => evaluate("document.body.innerText");

async function shot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(result.data, "base64"));
  screenshots.push(`${name}.png`);
  return `${name}.png`;
}

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

async function pollFor(expression, timeoutMs = 15000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return true;
    await settle(150);
  }

  return false;
}

/**
 * Navigate and wait for the body map. A cold headless Chrome can refuse the very first connection,
 * so this retries and reports what the page actually said rather than failing silently.
 */
async function goto(url, label, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await send("Page.navigate", { url });

    if (
      await pollFor(
        `document.readyState === "complete" && document.querySelector('svg[role="group"]') !== null`,
        6000,
      )
    ) {
      return true;
    }

    const seen = await evaluate(
      `document.title + " | " + document.body.innerText.slice(0, 80).replace(/[^\\x20-\\x7e]+/g, " ")`,
    ).catch(() => "(unreadable)");
    console.log(`      ${label}: navigate attempt ${attempt}/${attempts} did not reach the map -> ${seen}`);
    await settle(800);
  }

  return false;
}

async function setViewport(viewport) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.dsf,
    mobile: viewport.width < 640,
  });
  await send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-color-scheme", value: viewport.mode }],
  });
}

/** A trusted click: real mouse events at a viewport point, as a person would make them. */
async function clickAt(x, y) {
  const common = { x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 };
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...common, buttons: 0 });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...common, buttons: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...common, buttons: 0 });
  await settle(120);
}

/** Click the first control whose visible text matches, at its own centre. */
async function clickByText(text) {
  const point = await evaluate(`(() => {
    const wanted = ${JSON.stringify(text)};
    const el = [...document.querySelectorAll("button, a[href]")].find(
      (candidate) => (candidate.innerText || "").trim().toLowerCase() === wanted.toLowerCase(),
    );
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);

  if (!point) return false;
  await clickAt(point.x, point.y);
  return true;
}

/** Typing through the native value setter plus a bubbling input event: what React reads. */
/**
 * Click a control by CSS selector. The disclosure's two controls are found by id rather than by their
 * wording, so a copy change cannot silently make this harness click the wrong thing.
 */
async function clickSelector(selector) {
  return evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`,
  );
}

/** How many interview requests this run has sent so far. */
function interviewPostCount() {
  return postedBodies.filter((p) => p.url.includes("/api/interview")).length;
}

/**
 * How many of those requests completed a card (`ISS-24`).
 *
 * The request that finishes a session is the one carrying all but the last answer: the route words the
 * card on the third answer, so its body holds two answers and a text. Counting them is how a gate can see
 * how many **completions** a round produced - and a completion is what the screen saves a card for - with
 * no session and therefore no write anywhere.
 */
function completionCount() {
  return postedBodies.filter((p) => {
    if (!p.url.includes("/api/interview") || p.postData === null) return false;

    try {
      const body = JSON.parse(p.postData);
      return Array.isArray(body.answers) && body.answers.length === 2;
    } catch {
      return false;
    }
  }).length;
}

/**
 * Open or close the body map's short-screen panel (Phase 2H fix).
 *
 * Below a 600px-tall viewport the check-in screen starts with the map closed, behind a compact control,
 * so the fixed line and the fields stay reachable. Gates that measure the map have to open it first,
 * exactly as a person would; gates that measure the fixed line must leave the screen as it starts. It is
 * a no-op wherever the control does not exist, which is every taller viewport.
 */
async function setMapOpen(open) {
  const state = await evaluate(
    `(() => { const map = document.querySelector("#checkin-map"); const toggle = document.querySelector("#checkin-map-toggle"); return { visible: Boolean(map) && map.offsetParent !== null, toggle: Boolean(toggle) && toggle.offsetParent !== null }; })()`,
  );

  if (!state.toggle || state.visible === open) return;

  await clickSelector("#checkin-map-toggle");
  await settle(300);
}

async function typeInto(selector, text) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
    setter.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
}

async function pressKey(key, code, vk) {
  const common = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...common });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
  await settle(80);
}

/* ------------------------------------------------ what the live DOM actually says */

/**
 * One measurement pass over the rendered page. Everything a layout, sizing, naming or compliance
 * gate needs is read here, from computed styles and client rectangles - never from the source.
 */
const MEASURE = `(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const de = document.documentElement;
  const round = (n) => +Number(n).toFixed(1);
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height), right: round(r.right), bottom: round(r.bottom) };
  };
  const nameOf = (el) =>
    el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 48) || el.getAttribute("placeholder") || el.tagName;

  const controls = [...document.querySelectorAll('button, [role="button"], input, textarea, select, a[href]')]
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      name: nameOf(el),
      pressed: el.getAttribute("aria-pressed"),
      tabindex: el.getAttribute("tabindex"),
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
      rect: rectOf(el),
    }))
    .filter((c) => c.rect.w > 0 && c.rect.h > 0);

  const overlaps = [];
  for (let i = 0; i < controls.length; i += 1) {
    for (let j = i + 1; j < controls.length; j += 1) {
      const a = controls[i].rect;
      const b = controls[j].rect;
      const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      if (ox > 1 && oy > 1) overlaps.push({ a: controls[i].name, b: controls[j].name, ox: round(ox), oy: round(oy) });
    }
  }

  const clipped = [...document.querySelectorAll("h1,h2,h3,p,span,label,dd,dt,li,button,textarea")]
    .filter((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const hClip = el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== "visible";
      const vClip = el.scrollHeight > el.clientHeight + 1 && cs.overflowY !== "visible";
      return hClip || vClip;
    })
    .map((el) => ({ tag: el.tagName.toLowerCase(), text: (el.textContent || "").trim().slice(0, 40) }));

  const pastRight = [...document.querySelectorAll("body *")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > vw + 1;
    })
    .map((el) => ({ tag: el.tagName.toLowerCase(), right: round(el.getBoundingClientRect().right) }));

  const groups = [...document.querySelectorAll('[role="group"]')].map((g) => ({
    name: g.getAttribute("aria-label"),
    options: [...g.querySelectorAll("button")].map((b) => (b.innerText || "").trim()),
  }));

  const footer = document.querySelector("footer");
  const svg = document.querySelector('svg[role="group"]');
  const vb = svg && svg.viewBox ? svg.viewBox.baseVal : null;
  const silhouette = svg ? svg.querySelector('g[aria-hidden="true"]') : null;
  const silhouetteShapes = silhouette ? [...silhouette.children] : [];
  const silhouetteRect = silhouetteShapes.length
    ? silhouetteShapes.reduce(
        (acc, el) => {
          const r = el.getBoundingClientRect();
          return {
            x: Math.min(acc.x, r.x), y: Math.min(acc.y, r.y),
            right: Math.max(acc.right, r.right), bottom: Math.max(acc.bottom, r.bottom),
          };
        },
        { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity },
      )
    : null;

  const zones = svg
    ? [...svg.querySelectorAll('[role="button"]')].map((g) => {
        const rects = [...g.querySelectorAll("rect")];
        const first = rects[0];
        const cs = first ? getComputedStyle(first) : null;
        const r = first ? first.getBoundingClientRect() : null;
        return {
          label: g.getAttribute("aria-label"),
          pressed: g.getAttribute("aria-pressed"),
          tabindex: g.getAttribute("tabindex"),
          rectCount: rects.length,
          strokeWidth: cs ? cs.strokeWidth : null,
          fill: cs ? cs.fill : null,
          stroke: cs ? cs.stroke : null,
          centre: r ? { x: round(r.x + r.width / 2), y: round(r.y + r.height / 2) } : null,
          size: r ? { w: round(r.width), h: round(r.height) } : null,
          rects: rects.map((rect) => {
            const rr = rect.getBoundingClientRect();
            return { x: round(rr.x), y: round(rr.y), w: round(rr.width), h: round(rr.height), right: round(rr.right), bottom: round(rr.bottom) };
          }),
        };
      })
    : [];

  const readout = document.querySelector('[aria-live="polite"]');
  const heading = document.querySelector("h1");
  const field = document.querySelector("textarea, input[type=text]");
  const fieldStyle = field ? getComputedStyle(field) : null;
  const text = document.body.innerText;
  const lower = text.toLowerCase();
  const bodyStyle = getComputedStyle(document.body);

  return {
    vw: vw, vh: vh,
    scrollWidth: de.scrollWidth, scrollHeight: de.scrollHeight,
    bodyFontFamily: bodyStyle.fontFamily,
    bodyColour: bodyStyle.color,
    bodyBackground: bodyStyle.backgroundColor,
    headingFontFamily: heading ? getComputedStyle(heading).fontFamily : null,
    fontsStatus: document.fonts.status,
    geistAvailable: document.fonts.check("16px Geist"),
    newsreaderAvailable: document.fonts.check("16px Newsreader"),
    controls: controls,
    groups: groups,
    overlaps: overlaps,
    clipped: clipped,
    pastRight: pastRight.slice(0, 10),
    pastRightCount: pastRight.length,
    footerPresent: Boolean(footer),
    footerRect: footer ? rectOf(footer) : null,
    footerColour: footer ? getComputedStyle(footer.querySelector("p") || footer).color : null,
    disclaimerPresent: text.includes(${JSON.stringify(DISCLAIMER)}),
    prohibitedHits: ${JSON.stringify(PROHIBITED)}.filter((stem) => lower.includes(stem)),
    svgPresent: Boolean(svg),
    svgRect: svg ? rectOf(svg) : null,
    declaredMapWidth: svg && svg.getAttribute("data-map-width") ? Number(svg.getAttribute("data-map-width")) : null,
    declaredMapHeight: svg && svg.getAttribute("data-map-height") ? Number(svg.getAttribute("data-map-height")) : null,
    viewBox: vb ? { width: round(vb.width), height: round(vb.height) } : null,
    scaleX: svg && vb && vb.width ? +(svg.getBoundingClientRect().width / vb.width).toFixed(4) : null,
    scaleY: svg && vb && vb.height ? +(svg.getBoundingClientRect().height / vb.height).toFixed(4) : null,
    silhouetteShapeCount: silhouetteShapes.length,
    silhouetteTags: silhouetteShapes.map((el) => el.tagName.toLowerCase()),
    silhouetteRect:
      silhouetteRect && Number.isFinite(silhouetteRect.x)
        ? {
            x: round(silhouetteRect.x),
            y: round(silhouetteRect.y),
            right: round(silhouetteRect.right),
            bottom: round(silhouetteRect.bottom),
          }
        : null,
    zones: zones,
    zoneCount: zones.length,
    readoutText: readout ? readout.textContent.trim() : null,
    readoutAriaLive: readout ? readout.getAttribute("aria-live") : null,
    readoutColour: readout ? getComputedStyle(readout).color : null,
    headingText: heading ? heading.textContent.trim() : null,
    fieldPresent: Boolean(field),
    fieldRequired: field ? field.hasAttribute("required") || field.getAttribute("aria-required") === "true" : null,
    fieldPlaceholder: field ? field.getAttribute("placeholder") : null,
    fieldColour: fieldStyle ? fieldStyle.color : null,
    minControlHeight: controls.length ? Math.min(...controls.map((c) => c.rect.h)) : null,
    minZoneWidth: zones.length ? Math.min(...zones.map((z) => z.size.w)) : null,
    minZoneHeight: zones.length ? Math.min(...zones.map((z) => z.size.h)) : null,
  };
})()`;

/**
 * The sticky-disclaimer sweep (A4's rejection gates). Scrolls the page in eleven steps and records,
 * at each one, whether the fixed line is inside the viewport and whether it covers any interactive
 * control. A footer that is always visible but sits on top of the description field or the submit
 * button is a failure, not a success.
 */
const FOOTER_SWEEP = `(async () => {
  const footer = document.querySelector("footer");
  if (!footer) return { found: false };
  const round = (n) => +Number(n).toFixed(1);
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const positions = [];
  for (let i = 0; i <= 10; i += 1) {
    const y = Math.round((max * i) / 10);
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
    const f = footer.getBoundingClientRect();
    const occluding = [];
    for (const el of document.querySelectorAll("button, input, textarea, select, a[href]")) {
      if (footer.contains(el) || el.contains(footer)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const ox = Math.min(f.right, r.right) - Math.max(f.left, r.left);
      const oy = Math.min(f.bottom, r.bottom) - Math.max(f.top, r.top);
      if (ox > 1 && oy > 1) occluding.push(el.getAttribute("aria-label") || (el.innerText || "").trim().slice(0, 24) || el.tagName);
    }
    positions.push({
      y: y,
      top: round(f.top),
      bottom: round(f.bottom),
      visible: f.top < window.innerHeight && f.bottom > 0,
      occluding: occluding,
    });
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 60));
  return { found: true, max: max, positions: positions };
})()`;

/**
 * The alignment measurement (L2), in two readings that must not be confused with each other:
 *
 *   - **overhang** - zone geometry drawn outside the silhouette. The zone perimeter is walked every
 *     3px, half a pixel inside the edge, and each point is tested against the silhouette's own
 *     shapes. A perimeter point that is off the figure means the outline leaves the body there; the
 *     depth of the worst few is measured, so a rounded corner (a few pixels) reads differently from
 *     a whole edge in the wrong place.
 *   - **coverage** - silhouette area that no zone covers: a visible body area the user cannot tap.
 *     Each silhouette shape is sampled on a grid, and a painted sample with no zone under it is
 *     counted against that shape.
 *
 * The legitimate-contour case needs no third reading: a zone edge that coincides with the
 * silhouette's edge produces no off-perimeter samples at all, because the walk stays half a pixel
 * inside the zone.
 */
const ALIGNMENT = `(() => {
  const svg = document.querySelector('svg[role="group"]');
  if (!svg) return { svg: false };
  const silhouette = svg.querySelector('g[aria-hidden="true"]');
  if (!silhouette) return { svg: true, silhouette: false };

  const shapes = [...silhouette.children];
  const zoneRects = [...svg.querySelectorAll('[role="button"] rect')];
  const inView = (x, y) => x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
  const onFigure = (x, y) => inView(x, y) && document.elementsFromPoint(x, y).some((el) => shapes.includes(el));
  const onZone = (x, y) => inView(x, y) && document.elementsFromPoint(x, y).some((el) => zoneRects.includes(el));

  const INSET = 0.5;
  const STEP = 3;
  const MAX_DEPTH = 40;

  const zones = [...svg.querySelectorAll('[role="button"]')].map((g) => {
    const rects = [...g.querySelectorAll("rect")];
    const edges = { top: 0, right: 0, bottom: 0, left: 0 };
    let samples = 0;
    let off = 0;
    let maxOverhang = 0;
    let depthSamples = 0;

    for (const rect of rects) {
      const r = rect.getBoundingClientRect();
      const x0 = r.x + INSET;
      const y0 = r.y + INSET;
      const x1 = r.right - INSET;
      const y1 = r.bottom - INSET;
      if (x1 <= x0 || y1 <= y0) continue;

      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;

      const walk = (from, to, fixed, horizontal, edge) => {
        const steps = Math.max(2, Math.ceil(Math.abs(to - from) / STEP));

        for (let i = 0; i <= steps; i += 1) {
          const t = from + ((to - from) * i) / steps;
          const x = horizontal ? t : fixed;
          const y = horizontal ? fixed : t;
          samples += 1;
          if (onFigure(x, y)) continue;

          off += 1;
          edges[edge] += 1;
          if (depthSamples >= 6) continue;

          // How far inward must you go before the body is there? That is the overhang's depth.
          depthSamples += 1;
          const dx = cx - x;
          const dy = cy - y;
          const length = Math.hypot(dx, dy) || 1;

          for (let step = 1; step <= MAX_DEPTH; step += 1) {
            if (onFigure(x + (dx / length) * step, y + (dy / length) * step) || step === MAX_DEPTH) {
              if (step > maxOverhang) maxOverhang = step;
              break;
            }
          }
        }
      };

      walk(x0, x1, y0, true, "top");
      walk(x0, x1, y1, true, "bottom");
      walk(y0, y1, x0, false, "left");
      walk(y0, y1, x1, false, "right");
    }

    return {
      label: g.getAttribute("aria-label"),
      rectCount: rects.length,
      samples: samples,
      off: off,
      edges: edges,
      maxOverhangPx: maxOverhang,
    };
  });

  let figureSamples = 0;
  let uncovered = 0;
  let firstUncovered = null;
  const shapeReport = [];

  shapes.forEach((shape, index) => {
    const r = shape.getBoundingClientRect();
    const cols = Math.max(2, Math.round(r.width / 16));
    const rows = Math.max(2, Math.round(r.height / 16));
    let painted = 0;
    let bare = 0;

    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const x = r.x + (r.width * (i + 0.5)) / cols;
        const y = r.y + (r.height * (j + 0.5)) / rows;
        if (!onFigure(x, y)) continue;

        painted += 1;
        figureSamples += 1;

        if (!onZone(x, y)) {
          bare += 1;
          uncovered += 1;
          if (!firstUncovered) firstUncovered = { x: Math.round(x), y: Math.round(y) };
        }
      }
    }

    shapeReport.push({
      index: index,
      tag: shape.tagName.toLowerCase(),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      painted: painted,
      uncovered: bare,
    });
  });

  return {
    svg: true,
    silhouette: true,
    shapes: shapes.length,
    zones: zones,
    coverage: {
      figureSamples: figureSamples,
      uncovered: uncovered,
      firstUncovered: firstUncovered,
      shapes: shapeReport,
    },
  };
})()`;

/**
 * The rendered colours of the pairs the design foundation promises, read from computed styles.
 * A5's "rendered browser styles" half: the stylesheet half is src/lib/designTokens.test.ts.
 */
const COLOURS = `(() => {
  const svg = document.querySelector('svg[role="group"]');
  const body = getComputedStyle(document.body);
  const styleOf = (el) => (el ? getComputedStyle(el) : null);
  const colourOf = (el) => { const s = styleOf(el); return s ? s.color : null; };
  const silhouette = svg ? svg.querySelector('g[aria-hidden="true"] rect, g[aria-hidden="true"] path') : null;
  const zones = svg ? [...svg.querySelectorAll('[role="button"]')] : [];
  const unselected = zones.find((g) => g.getAttribute("aria-pressed") !== "true");
  const selected = zones.find((g) => g.getAttribute("aria-pressed") === "true");
  const unselectedRect = unselected ? unselected.querySelector("rect") : null;
  const selectedRect = selected ? selected.querySelector("rect") : null;
  const readout = document.querySelector('[aria-live="polite"]');
  const pressedToggle = [...document.querySelectorAll('[role="group"] button')].find(
    (b) => b.getAttribute("aria-pressed") === "true",
  );
  const footerP = document.querySelector("footer p");
  const pin = svg ? svg.querySelector("circle") : null;
  return {
    paper: body.backgroundColor,
    ink: body.color,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    surface: silhouette ? styleOf(silhouette).fill : null,
    zoneStroke: unselectedRect ? styleOf(unselectedRect).stroke : null,
    zoneStrokeWidth: unselectedRect ? styleOf(unselectedRect).strokeWidth : null,
    selectedFill: selectedRect ? styleOf(selectedRect).fill : null,
    selectedStroke: selectedRect ? styleOf(selectedRect).stroke : null,
    accentText: readout ? colourOf(readout) : null,
    accent: pressedToggle ? styleOf(pressedToggle).backgroundColor : null,
    accentInk: pressedToggle ? colourOf(pressedToggle) : null,
    muted: footerP ? colourOf(footerP) : null,
    pinFill: pin ? styleOf(pin).fill : null,
    pinStroke: pin ? styleOf(pin).stroke : null,
  };
})()`;

/* --------------------------------------------------------- colour maths (WCAG 2.1) */

/** `rgb()`, `rgba()`, `#rgb` or `#rrggbb` to channels. Anything else is null, never a guess. */
function parseColour(value) {
  if (!value) return null;
  const text = String(value).trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].split("").map((d) => d + d).join("") : hex[1];
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (!rgb) return null;

  const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null;

  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

function linearise(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(colour) {
  return 0.2126 * linearise(colour.r) + 0.7152 * linearise(colour.g) + 0.0722 * linearise(colour.b);
}

/** The WCAG 2.1 ratio between two rendered colours, or null when either is unreadable. */
function ratio(foreground, background) {
  const a = parseColour(foreground);
  const b = parseColour(background);
  if (!a || !b || a.a === 0 || b.a === 0) return null;

  const first = luminance(a);
  const second = luminance(b);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/* ------------------------------------------------------------- gate groups */

/** Layout, touch-target and map-space gates for one viewport. */
function layoutGates(prefix, m) {
  gate(
    "T1.zone44",
    `${prefix}: every zone is at least 44x44 CSS px`,
    m.minZoneWidth !== null && m.minZoneWidth >= 44 && m.minZoneHeight >= 44,
    `smallest zone ${m.minZoneWidth}x${m.minZoneHeight}`,
  );
  gate(
    "T2.control44",
    `${prefix}: every interactive control is at least 44px tall`,
    m.minControlHeight !== null && m.minControlHeight >= 44,
    m.controls.length ? `smallest is "${m.controls.reduce((a, b) => (a.rect.h <= b.rect.h ? a : b)).name}"` : "no controls",
  );
  gate("T3.scroll", `${prefix}: no horizontal scrolling`, m.scrollWidth <= m.vw + 1, `scrollWidth=${m.scrollWidth} vw=${m.vw}`);
  gate("T4.overlap", `${prefix}: no overlapping controls`, m.overlaps.length === 0, m.overlaps.length ? JSON.stringify(m.overlaps.slice(0, 3)) : "none");
  gate("T5.clip", `${prefix}: no clipped text`, m.clipped.length === 0, m.clipped.length ? JSON.stringify(m.clipped.slice(0, 3)) : "none");
  gate("T6.overflow", `${prefix}: no element past the right edge`, m.pastRightCount === 0, m.pastRightCount ? JSON.stringify(m.pastRight.slice(0, 2)) : "none");

  // S2 - the viewBox must not be stretched, and its aspect must match the map's own space.
  const uniform =
    m.scaleX !== null && m.scaleY !== null && Math.abs(m.scaleY / m.scaleX - 1) < 0.01;
  gate(
    "S2.uniform",
    `${prefix}: the drawing box does not stretch the viewBox`,
    uniform,
    m.scaleX === null ? "no viewBox" : `x=${m.scaleX}px/unit, y=${m.scaleY}px/unit (y is ${(m.scaleY / m.scaleX).toFixed(2)}x x)`,
  );

  // S3 - the drawing must declare the map space it was authored in, and must not stretch it.
  const declared =
    m.declaredMapWidth && m.declaredMapHeight
      ? { width: m.declaredMapWidth, height: m.declaredMapHeight }
      : null;
  const matchesSource = declared
    ? MAP_SPACES.some((space) => space.width === declared.width && space.height === declared.height)
    : false;
  const viewBoxMatchesDeclared =
    declared && m.viewBox
      ? Math.abs(m.viewBox.width / m.viewBox.height / (declared.width / declared.height) - 1) < 0.01
      : false;

  gate(
    "S3.mapspace",
    `${prefix}: the drawing declares the map space it is authored in, and does not stretch it`,
    Boolean(declared) && matchesSource && viewBoxMatchesDeclared,
    declared
      ? `declared ${declared.width}x${declared.height}${matchesSource ? "" : " (no space regions.ts declares)"}, viewBox ${m.viewBox ? `${m.viewBox.width}x${m.viewBox.height}` : "none"}`
      : "the drawing declares no map space",
  );
}

/** Compliance gates that must hold on every screen, at every viewport. */
function complianceGates(prefix, m) {
  gate("P1.line", `${prefix}: the fixed line is rendered`, m.disclaimerPresent, m.disclaimerPresent ? "found" : "MISSING");
  gate(
    "P2.copy",
    `${prefix}: no prohibited word is rendered`,
    m.prohibitedHits.length === 0,
    m.prohibitedHits.join(",") || "none",
  );
}

/** Do two rectangles overlap by more than a pixel on both axes? */
function overlaps(a, b) {
  if (!a || !b) return false;
  const x = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  return x > 1 && y > 1;
}

/** The A4 rejection gates for the fixed line's placement. */
function disclaimerGates(prefix, m, sweep, focused, focusedRect) {
  const firstScreen = m.footerRect ? m.footerRect.y < m.vh && m.footerRect.bottom > 0 : false;
  gate("D1.firstScreen", `${prefix}: the fixed line is visible on the first screen`, firstScreen, m.footerRect ? `footer y=${m.footerRect.y} bottom=${m.footerRect.bottom} vh=${m.vh}` : "no footer");

  const positions = sweep.found ? sweep.positions : [];
  const hidden = positions.filter((p) => !p.visible);
  gate(
    "D2.scrolling",
    `${prefix}: the fixed line stays visible while scrolling`,
    sweep.found && positions.length > 0 && hidden.length === 0,
    sweep.found ? `${positions.length - hidden.length}/${positions.length} positions visible${hidden.length ? `, first hidden at y=${hidden[0].y}` : ""}` : "no footer",
  );

  const occluded = positions.filter((p) => p.occluding.length > 0);
  gate(
    "D4.noOcclusion",
    `${prefix}: the fixed line never covers a control`,
    sweep.found && occluded.length === 0,
    sweep.found ? (occluded.length ? `${occluded.length} position(s), first at y=${occluded[0].y}: ${occluded[0].occluding.join(",")}` : "none") : "no footer",
  );

  if (focused) {
    const visible = focused.footerRect ? focused.footerRect.y < focused.vh && focused.footerRect.bottom > 0 : false;
    const covers = overlaps(focused.footerRect, focusedRect);
    gate(
      "D3.focus",
      `${prefix}: the fixed line is visible with the description field focused, and does not cover it`,
      visible && !covers,
      focused.footerRect
        ? `footer y=${focused.footerRect.y} bottom=${focused.footerRect.bottom} vh=${focused.vh}${covers ? `, COVERS the focused field (${focusedRect.x},${focusedRect.y})` : ", field clear"}`
        : "no footer",
    );
  }
}

/** A4's contrast gates, recomputed from the colours the browser actually rendered. */
function contrastGates(prefix, colours) {
  const pairs = [
    { id: "C1.outline", label: "zone outline on the figure", fg: colours.zoneStroke, bg: colours.surface, needs: NON_TEXT },
    { id: "C2.selected", label: "selected zone fill on the page", fg: colours.selectedFill, bg: colours.paper, needs: NON_TEXT },
    { id: "C3.accentText", label: "accent as text on the page", fg: colours.accentText, bg: colours.paper, needs: TEXT },
    { id: "C4.accentInk", label: "accent ink on the accent fill", fg: colours.accentInk, bg: colours.accent, needs: TEXT },
    { id: "C5.ink", label: "body text on the page", fg: colours.ink, bg: colours.paper, needs: TEXT },
    { id: "C6.muted", label: "muted text on the page", fg: colours.muted, bg: colours.paper, needs: TEXT },
    { id: "C7.pin", label: "pin core against its own ring", fg: colours.pinFill, bg: colours.pinStroke, needs: NON_TEXT },
  ];

  for (const pair of pairs) {
    const measured = ratio(pair.fg, pair.bg);
    gate(
      pair.id,
      `${prefix}: ${pair.label} (needs ${pair.needs}:1)`,
      measured !== null && measured >= pair.needs,
      measured === null
        ? `unreadable colours: ${pair.fg} on ${pair.bg}`
        : `${measured.toFixed(2)}:1 (${pair.fg} on ${pair.bg})`,
    );
  }

  // C8/C9 - the product's paper, not the visitor's. Every screen renders through `PaperPage`, so the
  // stylesheet's pin (`html:has(.paper-page)`) resolves the light palette in both colour schemes, and the
  // native controls follow it. These two gates are the rendered half of that claim, and this function runs
  // at a dark-preferring viewport as well as a light one; src/lib/paletteScope.test.ts is the source half.
  const sameColour = (first, second) =>
    Boolean(first) && Boolean(second) && first.r === second.r && first.g === second.g && first.b === second.b;

  gate(
    "C8.pinned",
    `${prefix}: the page holds SomaMap's paper whatever the colour scheme asks for`,
    sameColour(parseColour(colours.paper), parseColour(LIGHT_PALETTE.paper)) &&
      sameColour(parseColour(colours.ink), parseColour(LIGHT_PALETTE.ink)),
    `paper ${colours.paper} (stylesheet light ${LIGHT_PALETTE.paper}), ink ${colours.ink} (stylesheet light ${LIGHT_PALETTE.ink})`,
  );

  gate(
    "C9.native",
    `${prefix}: native controls follow the light colour scheme`,
    typeof colours.colorScheme === "string" &&
      colours.colorScheme.includes("light") &&
      !colours.colorScheme.includes("dark"),
    `color-scheme=${colours.colorScheme}`,
  );
}

/** The figure and view controls the plan names, read from the rendered groups. */
function optionsIn(m, groupName) {
  const group = m.groups.find((g) => (g.name || "").toLowerCase() === groupName.toLowerCase());
  return group ? group.options : null;
}

/** A7: the naming the plan approved, and the optional description field. */
function namingGates(m) {
  const figure = optionsIn(m, "Figure");
  gate(
    "N1.figure",
    'a "Figure" group offers Neutral, Feminine and Masculine',
    Boolean(figure) && REQUIRED_FIGURES.every((f) => figure.includes(f)),
    figure ? figure.join(", ") : "no group labelled Figure",
  );

  const views = optionsIn(m, "View");
  gate(
    "N2.views",
    'the "View" group offers Front, Back and Side',
    Boolean(views) && REQUIRED_VIEWS.every((v) => views.includes(v)),
    views ? views.join(", ") : "no group labelled View",
  );

  gate(
    "N3.optional",
    "the description field is optional",
    m.fieldPresent === true && m.fieldRequired === false,
    m.fieldPresent ? `required=${m.fieldRequired}, placeholder="${m.fieldPlaceholder}"` : "no field",
  );
}



/* ------------------------------------------------- the alignment sweep (L1/L2/L3) */

const scrollFigureIntoView = () =>
  evaluate(`(() => {
    const s = document.querySelector('svg[role="group"]');
    if (s) s.scrollIntoView({ block: "center" });
    return Boolean(s);
  })()`);

/** What the page says after a tap: the readout, the pressed zone, and where the pin landed. */
const TAP_STATE = `(() => {
  const svg = document.querySelector('svg[role="group"]');
  const readout = document.querySelector('[aria-live="polite"]');
  const pressed = svg ? [...svg.querySelectorAll('[role="button"]')].filter((g) => g.getAttribute("aria-pressed") === "true") : [];
  const pin = svg ? svg.querySelector("circle") : null;
  const box = pin ? pin.getBoundingClientRect() : null;
  return {
    readout: readout ? readout.textContent.trim() : null,
    pressedCount: pressed.length,
    pressedLabel: pressed.length === 1 ? pressed[0].getAttribute("aria-label") : null,
    pin: box ? { x: +(box.x + box.width / 2).toFixed(1), y: +(box.y + box.height / 2).toFixed(1) } : null,
  };
})()`;

/**
 * L2, reading one: does any zone's outline leave the body? Extracted so the self-test can call it
 * against a deliberately broken page.
 */
function l2Gate(prefix, label, align) {
  const off = align.silhouette ? align.zones.filter((z) => z.off > 0) : [];

  return gate(
    "L2.overhang",
    `${prefix} ${label}: no zone outline leaves the body`,
    Boolean(align.silhouette) && off.length === 0,
    align.silhouette
      ? off.length
        ? off
            .map((z) => {
              const edges = Object.entries(z.edges)
                .filter(([, count]) => count > 0)
                .map(([edge, count]) => `${edge}:${count}`)
                .join(",");

              return `${z.label}: ${z.off}/${z.samples} off (${edges}), worst ${z.maxOverhangPx}px`;
            })
            .join(" | ")
        : `${align.zones.length} zones, every perimeter point on the figure`
      : "no silhouette group to test against",
  );
}

/**
 * L2, reading two: is any drawn part of the body untappable? A visible area with no zone under it is
 * a place the user can see and cannot name.
 */
function l2CoverageGate(prefix, label, align) {
  const coverage = align.coverage;
  const bare = coverage ? coverage.shapes.filter((shape) => shape.uncovered > 0) : [];

  return gate(
    "L2.coverage",
    `${prefix} ${label}: every drawn part of the body can be tapped`,
    Boolean(coverage) && coverage.uncovered === 0,
    coverage
      ? coverage.uncovered === 0
        ? `${coverage.figureSamples} figure samples, all inside a zone`
        : `${coverage.uncovered}/${coverage.figureSamples} figure samples uncovered (first at ${coverage.firstUncovered.x},${coverage.firstUncovered.y}); ${bare
            .map(
              (shape) =>
                `#${shape.index} ${shape.tag} ${shape.rect.w}x${shape.rect.h} at ${shape.rect.x},${shape.rect.y}: ${shape.uncovered}/${shape.painted}`,
            )
            .join(" | ")}`
      : "no coverage measurement",
  );
}

/**
 * The alignment sweep: for every figure and every view at one viewport, prove that the drawing and
 * the fixed zone map agree (L1/L2), that a tap on a zone names that zone (L3), and record the
 * drawing boxes so the sizing gates (S1/S4/S5) can compare the views.
 */
async function alignmentPass(viewport, sizing) {
  const prefix = viewport.name;
  const first = await evaluate(MEASURE);
  const views = optionsIn(first, "View") ?? ["Front", "Back"];
  const figures = optionsIn(first, "Figure") ?? [null];

  for (const figure of figures) {
    if (figure) {
      if (!(await clickByText(figure))) continue;
      await settle(300);
    }

    for (const view of views) {
      if (!(await clickByText(view))) continue;
      await settle(300);
      await scrollFigureIntoView();
      await settle(250);

      const label = figure ? `${figure}/${view}` : view;
      const m = await evaluate(MEASURE);

      if (!figure) {
        sizing[label] = {
          width: m.svgRect ? m.svgRect.w : null,
          height: m.svgRect ? m.svgRect.h : null,
          viewBox: m.viewBox,
        };
      }

      gate(
        "L1.form",
        `${prefix} ${label}: the figure and its zones are drawn`,
        m.svgPresent && m.silhouetteShapeCount > 0 && m.zoneCount > 0,
        `silhouette shapes=${m.silhouetteShapeCount} (${m.silhouetteTags.join(",") || "none"}) zones=${m.zoneCount}`,
      );

      const align = await evaluate(ALIGNMENT);
      l2Gate(prefix, label, align);
      l2CoverageGate(prefix, label, align);

      const taps = [];
      for (const zone of m.zones) {
        const expected = (zone.label || "").replace("Region ", "").replace(", selected", "");
        await clickAt(zone.centre.x, zone.centre.y);
        await settle(160);
        const after = await evaluate(TAP_STATE);
        const inside = after.pin
          ? zone.rects.some(
              (r) => after.pin.x >= r.x - 2 && after.pin.x <= r.right + 2 && after.pin.y >= r.y - 2 && after.pin.y <= r.bottom + 2,
            )
          : false;
        taps.push({ expected, ...after, pinInside: inside });
      }

      const wrong = taps.filter(
        (t) => t.readout !== `Region: ${t.expected}` || t.pressedCount !== 1 || t.pressedLabel !== `Region ${t.expected}, selected`,
      );
      const pinOutside = taps.filter((t) => !t.pinInside);
      gate(
        "L3.tap",
        `${prefix} ${label}: a tap on a zone names exactly that zone`,
        taps.length > 0 && wrong.length === 0 && pinOutside.length === 0,
        wrong.length || pinOutside.length
          ? `${wrong.length} wrong readout(s), ${pinOutside.length} pin(s) outside the zone; first: ${(wrong[0] ?? pinOutside[0])?.expected} -> ${(wrong[0] ?? pinOutside[0])?.readout}`
          : `${taps.length} zones tapped, all correct`,
      );
    }
  }
}


/** S1/S4/S5: the views share a height, the side view is narrower, and no view is stretched. */
function sizingGates(prefix, sizing) {
  const entries = Object.entries(sizing).filter(([, v]) => v.height !== null);
  const heights = entries.map(([, v]) => v.height);
  const spread = heights.length ? Math.max(...heights) - Math.min(...heights) : null;

  gate(
    "S1.height",
    `${prefix}: every view renders at the same height`,
    heights.length > 1 && spread !== null && spread <= 1,
    heights.length ? `heights ${heights.join(", ")} (spread ${spread}px)` : "no views measured",
  );

  const front = sizing.Front;
  const side = sizing.Side;
  gate(
    "S4.side",
    `${prefix}: the side view is narrower than the front, and not stretched`,
    Boolean(front && side && side.width !== null && front.width !== null && side.width < front.width),
    side && front ? `front ${front.width}px vs side ${side.width}px` : "no side view",
  );

  const stretched = entries.filter(([, v]) => {
    if (!v.viewBox || !v.width || !v.height) return true;
    return Math.abs(v.width / v.height / (v.viewBox.width / v.viewBox.height) - 1) > 0.02;
  });
  gate(
    "S5.aspect",
    `${prefix}: every view keeps its own proportions`,
    entries.length > 0 && stretched.length === 0,
    stretched.length
      ? stretched.map(([k, v]) => `${k} ${v.width}x${v.height} vs ${v.viewBox?.width}x${v.viewBox?.height}`).join(" | ")
      : "all preserved",
  );
}

/* ------------------------------------- reading the card: the payload and the rendered rows */

/** The five approved schema fields, listed here rather than imported - the harness holds its own copy. */
const CARD_FIELDS = ["location_label", "quality_words", "intensity_metaphor", "duration", "user_own_sentence"];

/** The label each field carries on screen. */
const CARD_LABELS = {
  location_label: "Where",
  quality_words: "Words you chose",
  intensity_metaphor: "It feels like",
  duration: "How long",
  user_own_sentence: "In your words",
};

/**
 * The last completed session's response body, parsed - the payload the route validated. Waits for it
 * because the body is fetched asynchronously once the response finishes loading.
 */
async function lastInterviewResponse(timeoutMs = 8000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    for (let index = apiResponses.length - 1; index >= 0; index -= 1) {
      const entry = apiResponses[index];

      if (entry.error) continue;

      try {
        const parsed = JSON.parse(entry.body);
        if (parsed && parsed.status === "complete") return parsed;
      } catch {
        /* not a JSON body, or not the one this gate wants */
      }
    }

    await settle(150);
  }

  return null;
}

/**
 * The card as it is rendered: the hero row first (`In your words`), then the rows the render model
 * allowed. Read structurally - the heading's sibling is the card, the hero is its first block, and
 * the remaining rows are the `dl`'s own `dt`/`dd` pairs - so a missing, duplicated or empty row shows
 * up as a mismatch rather than being smoothed over by a text search.
 */
const READ_CARD = `(() => {
  const root = document.querySelector("#card-title")?.nextElementSibling;
  if (!root) return null;

  const heroBlock = root.firstElementChild;
  const heroParas = heroBlock ? [...heroBlock.querySelectorAll(":scope > p")] : [];
  const hero = heroParas.length >= 2
    ? { label: heroParas[0].innerText.trim(), value: heroParas[1].innerText.trim() }
    : null;

  const dl = root.querySelector("dl");
  const fields = dl
    ? [...dl.children].map((row) => ({
        label: (row.querySelector("dt")?.innerText ?? "").trim(),
        value: (row.querySelector("dd")?.innerText ?? "").trim(),
      }))
    : [];

  return {
    hero,
    fields,
    dtCount: dl ? dl.querySelectorAll("dt").length : 0,
    ddCount: dl ? dl.querySelectorAll("dd").length : 0,
  };
})()`;

/**
 * What one session's card must be, given what that session actually collected (correction 2).
 *
 * The checks are deliberately separate, so a failure says which part moved:
 *
 *   1. the **internal payload** the route validated carries exactly the five approved fields - the
 *      schema is asserted on the payload, never on the screen, so hiding a row cannot hide a schema
 *      change;
 *   2. the **rendered rows** are the hero plus the rows the session can answer, in order, with the
 *      `How long` row present only when a duration was genuinely collected;
 *   3. no row is rendered twice and no rendered row is empty;
 *   4. the `How long` row, when it is shown, quotes the phrase the session itself supplied.
 */
function cardShapeProblems(payload, rows, withDuration) {
  const problems = [];

  const card = payload && typeof payload === "object" ? payload.card : null;
  const keys = card && typeof card === "object" ? Object.keys(card).sort() : [];

  if (keys.join(",") !== [...CARD_FIELDS].sort().join(",")) {
    problems.push(`internal payload keys ${JSON.stringify(keys)}`);
  }

  if (rows === null) {
    problems.push("the card did not render");
    return problems;
  }

  const expectedFields = CARD_FIELDS.filter(
    (field) => field !== "user_own_sentence" && (Boolean(withDuration) || field !== "duration"),
  );
  const expectedLabels = ["user_own_sentence", ...expectedFields].map((field) => CARD_LABELS[field]);
  const renderedLabels = [rows.hero?.label ?? "", ...rows.fields.map((row) => row.label)];

  if (renderedLabels.join(" | ") !== expectedLabels.join(" | ")) {
    problems.push(`rows ${JSON.stringify(renderedLabels)}`);
  }

  if (new Set(renderedLabels).size !== renderedLabels.length) {
    problems.push("a row is rendered twice");
  }

  const values = [rows.hero?.value ?? "", ...rows.fields.map((row) => row.value)];

  if (values.some((value) => value.length === 0)) {
    problems.push("a rendered row is empty");
  }

  if (rows.dtCount !== rows.fields.length || rows.ddCount !== rows.fields.length) {
    problems.push(`dt/dd pairs ${rows.dtCount}/${rows.ddCount} against ${rows.fields.length} row(s)`);
  }

  if (withDuration) {
    const duration = rows.fields.find((row) => row.label === CARD_LABELS.duration);

    if (!duration || duration.value !== withDuration) {
      problems.push(`How long shows ${JSON.stringify(duration?.value ?? "(no row)")}`);
    }
  }

  return problems;
}

/**
 * The journey again, with a time phrase in one answer (correction 2's second state).
 *
 * No shipped question asks how long, so the only way a duration can reach the card is a user
 * mentioning time in an answer. This session does exactly that, which is what makes the `How long`
 * row's *presence* testable rather than assumed.
 */
async function journeyWithDuration(prefix) {
  if (!(await goto(`${BASE}/checkin`, `${prefix} (duration session)`))) return null;

  await evaluate("document.fonts.ready.then(() => true)");
  await settle(300);
  await scrollFigureIntoView();
  await settle(200);

  const before = await evaluate(MEASURE);
  const chest = before.zones.find((z) => (z.label || "").includes("chest"));
  if (!chest) return null;

  await clickAt(chest.centre.x, chest.centre.y);
  await settle(200);
  await typeInto("#checkin-box", "a tight band across my chest");
  await settle(150);

  // The same disclosure gate as the first session (Phase 2D).
  const postsBeforeCheckIn = interviewPostCount();

  await clickByText("Continue");
  await settle(600);

  if (!(await acknowledgeExternalProcessing(`${prefix} (duration session)`, postsBeforeCheckIn))) return null;

  const answers = ["it has been there for two days", "a warm, spreading feeling", "a heavy blanket"];

  for (const answer of answers) {
    const ready = await pollFor(
      `(() => { const t = document.querySelector("textarea"); return Boolean(t) && !t.disabled; })()`,
      15000,
    );
    if (!ready) return null;
    if (!(await typeInto("textarea", answer))) return null;
    await settle(200);
    await clickByText("Continue");

    const advanced = await pollFor(
      `(() => {
        if (document.body.innerText.includes("Your card")) return true;
        const t = document.querySelector("textarea");
        return Boolean(t) && !t.disabled && t.value === "";
      })()`,
      15000,
    );
    if (!advanced) return null;
  }

  return {
    payload: await lastInterviewResponse(),
    rows: await evaluate(READ_CARD),
    // The `How long` row holds the duration expression inside the first answer
    // ("it has been there for two days" -> "two days"), not the whole answer.
    duration: "two days",
  };
}


/* ------------------------------------------------------- the disclosure (Phase 2D) */

/**
 * The external processing disclosure, and the acknowledgement it requires (Phase 2D).
 *
 * The interview cannot be reached without it: the check-in's Continue leads to the disclosure, and the
 * only way on is the acknowledgement control. `P4.disclosure` asserts that the notice names the
 * provider and the words that are sent, that the interview field is not on the page yet, and that
 * **no interview request has been sent** at the moment it appears - which is the property the phase
 * exists for. Returns false when the disclosure never appeared, so the gates that follow report a real
 * failure instead of timing out.
 */
async function acknowledgeExternalProcessing(prefix, postsBeforeCheckIn) {
  const appeared = await pollFor(
    `(() => Boolean(document.querySelector("#external-processing-acknowledge")))()`,
    10000,
  );

  if (!appeared) {
    gate("P4.disclosure", `${prefix}: the disclosure appears before the interview`, false, "the acknowledgement control never appeared");
    return false;
  }

  const text = await bodyText();
  // The interview's own field, by id: the check-in's box is a textarea too, and this must not match it.
  const interviewOnScreen = await evaluate(`Boolean(document.querySelector("#interview-answer"))`);
  const postsNow = interviewPostCount();
  const problems = [];

  for (const pattern of EXPECTED.must) {
    if (!pattern.test(text)) problems.push(`the disclosure does not say ${pattern}`);
  }

  for (const pattern of EXPECTED.mustNot) {
    if (pattern.test(text)) problems.push(`the disclosure claims ${pattern}, which is false in this build`);
  }

  if (interviewOnScreen) problems.push("the interview field is already on the page");
  if (postsNow !== postsBeforeCheckIn) problems.push(`${postsNow - postsBeforeCheckIn} interview request(s) were already sent`);

  gate(
    "P4.disclosure",
    `${prefix} (${EXPECTED_MODE} mode): the disclosure is accurate for this build, and appears before any interview request`,
    problems.length === 0,
    problems.length === 0 ? `${EXPECTED_MODE} wording; no interview request sent yet` : problems.join("; "),
  );

  const acknowledged = await clickSelector("#external-processing-acknowledge");

  await settle(500);

  return acknowledged;
}

/**
 * Declining the disclosure (Phase 2D): the interview must not start and nothing may be sent.
 *
 * The check is a count of interview requests before and after the decline, plus the page the user is
 * left on, plus the copy that says nothing was sent - so "not acknowledging sends nothing" is measured
 * rather than assumed from the UI.
 */
async function declinePass(prefix) {
  const postsBefore = interviewPostCount();

  if (!(await goto(`${BASE}/checkin`, `${prefix} (decline session)`))) return;

  await evaluate("document.fonts.ready.then(() => true)");
  await settle(300);
  await scrollFigureIntoView();
  await settle(200);

  const measured = await evaluate(MEASURE);
  const chest = measured.zones.find((z) => (z.label || "").includes("chest"));

  if (!chest) {
    gate("P6.declined", `${prefix}: declining sends nothing and starts no interview`, false, "no chest zone to tap");
    return;
  }

  await clickAt(chest.centre.x, chest.centre.y);
  await settle(200);
  await typeInto("#checkin-box", "a tight band across my chest");
  await settle(150);
  await clickByText("Continue");
  await settle(500);

  const declined = await clickSelector("#external-processing-decline");
  await settle(500);

  const text = await bodyText();
  // The interview's own field, by id - the check-in's box is a textarea as well, so `textarea` alone
  // would report the interview as started the moment the user is back on the check-in screen.
  const interviewOnScreen = await evaluate(`Boolean(document.querySelector("#interview-answer"))`);
  const keptWords = await evaluate(
    `(() => { const box = document.querySelector("#checkin-box"); return Boolean(box) && box.value === "a tight band across my chest"; })()`,
  );
  const postsAfter = interviewPostCount();
  const problems = [];

  if (!declined) problems.push("the decline control was not there");
  if (postsAfter !== postsBefore) problems.push(`${postsAfter - postsBefore} interview request(s) were sent`);
  if (interviewOnScreen) problems.push("the interview started anyway");
  if (!keptWords) problems.push("the words were not kept on the check-in screen");
  if (!text.includes("Nothing was sent")) problems.push("the screen does not say nothing was sent");

  gate(
    "P6.declined",
    `${prefix}: declining sends nothing and starts no interview`,
    problems.length === 0,
    problems.length === 0 ? "0 interview request(s), interview not started, words kept" : problems.join("; "),
  );
}


/* ------------------------------------------------------- the rebuild round (`ISS-24`) */

/**
 * Change the region from a finished card, and report what the round cost in requests.
 *
 * "Change the region" returns to the map with the answers kept, and continuing from there mounts the
 * interview again and rebuilds the card from them (`ISS-14`). The round must send one turn per answer and
 * complete **once**: the screen saves a card per completion, and a completion that cannot address the card
 * it rebuilds is exactly how one check-in became four journal entries. So this measures the round rather
 * than the card - three requests, one completion, the new region on every turn, and the rebuilt card
 * naming the region that was tapped.
 *
 * Nothing here needs a session, and nothing here writes: an unsigned-in build makes no journal request at
 * all (`ISS-17`), so the count of completions is the honest proxy for the count of saves.
 */
async function journeyRegionChange(prefix, from) {
  const problems = [];
  const postsBefore = interviewPostCount();
  const completionsBefore = completionCount();
  const other = from.label.includes("chest") ? "head" : "chest";

  if (!(await clickByText("Change the region"))) problems.push("the change-the-region control was not found");
  await settle(900);

  // Back on the check-in step, with the words the user wrote still in the box, and nothing sent by the way.
  const back = await evaluate(
    `(() => { const box = document.querySelector("#checkin-box"); return { box: Boolean(box), text: box ? box.value : "" }; })()`,
  );

  if (!back.box) problems.push("the check-in step did not come back");
  if (back.text.length === 0) problems.push("the words in the box were lost on the way back");
  if (interviewPostCount() !== postsBefore) problems.push("the way back sent an interview request");

  await setMapOpen(true);
  await settle(300);
  await scrollFigureIntoView();
  await settle(200);

  const measured = await evaluate(MEASURE);
  const zone = measured.zones.find((z) => (z.label || "").includes(other));

  if (!zone) {
    problems.push(`no ${other} zone to tap`);
    return { problems, detail: "" };
  }

  await clickAt(zone.centre.x, zone.centre.y);
  await settle(250);
  await clickByText("Continue");
  await settle(600);

  if (!(await acknowledgeExternalProcessing(`${prefix} (region change)`, interviewPostCount()))) {
    problems.push("the disclosure was not acknowledged");
    return { problems, detail: "" };
  }

  const reached = await pollFor(`document.body.innerText.includes("Your card")`, 20000);
  const added = interviewPostCount() - postsBefore;
  const completions = completionCount() - completionsBefore;
  const regions = postedBodies
    .filter((p) => p.url.includes("/api/interview"))
    .slice(postsBefore)
    .map((p) => {
      try {
        return JSON.parse(p.postData).regionLabel;
      } catch {
        return "(unparseable)";
      }
    });
  const cardText = await bodyText();

  if (!reached) problems.push("the rebuild never reached a card");
  if (added !== 3) problems.push(`${added} interview request(s) for one rebuild, expected 3`);
  if (completions !== 1) problems.push(`${completions} completion(s) for one rebuild, expected 1`);
  if (regions.some((region) => region !== other)) problems.push(`the rebuild sent the wrong region: ${JSON.stringify(regions)}`);
  if (!cardText.includes(other)) problems.push(`the rebuilt card does not name ${other}`);

  return {
    problems,
    detail: `${added} request(s), ${completions} completion, region ${JSON.stringify(regions)}, card names ${other}`,
  };
}

/* ------------------------------------------------------- the journey (regression pack) */

/**
 * Tap a region, answer three questions, and check the card the route validated: the region the user
 * tapped, the fixed line, and the card's own shape. Nothing is saved - the same path a real user
 * walks, so a compliance regression shows up here.
 *
 * The journey runs **twice**. The first session is the ordinary one: no shipped question asks how
 * long, and none of its answers mentions time, so its card has no duration and the `How long` row is
 * hidden. The second is the same walk with a time phrase in an answer, which is the only way a
 * duration reaches a card today, and its card must show the row. `J3.fields` reads both, because the
 * approved behaviour is defined by the pair: five schema fields in the payload always, and the
 * `How long` row on screen only when a duration was genuinely collected.
 */
async function journeyPass() {
  const prefix = "journey";

  if (!(await goto(`${BASE}/checkin`, prefix))) return;

  await evaluate("document.fonts.ready.then(() => true)");
  await settle(300);

  await scrollFigureIntoView();
  await settle(200);

  const before = await evaluate(MEASURE);
  const chest = before.zones.find((z) => (z.label || "").includes("chest"));
  if (!chest) {
    gate("J1.card", `${prefix}: the card is reached`, false, "no chest zone to tap");
    return;
  }

  await clickAt(chest.centre.x, chest.centre.y);
  await settle(200);
  await typeInto("#checkin-box", "a tight band across my chest");
  await settle(150);

  // Phase 2D: the interview sits behind the external processing disclosure, and only an explicit
  // acknowledgement opens it. Nothing may have been sent before that point.
  const postsBeforeCheckIn = interviewPostCount();

  await clickByText("Continue");
  await settle(600);

  if (!(await acknowledgeExternalProcessing(prefix, postsBeforeCheckIn))) return;

  for (let turn = 1; turn <= 3; turn += 1) {
    // Wait for the question to arrive: the answer field is disabled while a request is in flight.
    const ready = await pollFor(
      `(() => { const t = document.querySelector("textarea"); return Boolean(t) && !t.disabled; })()`,
      15000,
    );
    if (!ready) break;

    if (!(await typeInto("textarea", turn === 1 ? "tight, and steady" : "a warm, spreading feeling"))) break;
    await settle(200);
    await clickByText("Continue");

    // Either the next question is ready (an empty, enabled field) or the card has replaced it.
    const advanced = await pollFor(
      `(() => {
        if (document.body.innerText.includes("Your card")) return true;
        const t = document.querySelector("textarea");
        return Boolean(t) && !t.disabled && t.value === "";
      })()`,
      15000,
    );
    if (!advanced) break;
  }

  const reached = await evaluate(`document.body.innerText.includes("Your card")`);
  gate("J1.card", `${prefix}: three answers complete the card`, reached, reached ? "card reached" : "card not reached");

  if (!reached) return;

  await evaluate("window.scrollTo(0, 0)");
  await settle(200);
  await shot("p2-390-light-card");

  const cardText = await bodyText();
  const firstPayload = await lastInterviewResponse();
  const firstRows = await evaluate(READ_CARD);

  /**
   * The rebuild round (`ISS-24`): a finished card, "Change the region", and one more completion. This is
   * the round that used to add a second journal entry for one check-in, so it is measured here - and the
   * measurement is about the client, which is why it needs no session and writes nothing.
   *
   * The count before it is what lets `J4.regionSent` below read the check-in's own turns and nothing else:
   * the rebuild's turns carry the region *that* round tapped, which is `J5.rebuild`'s subject.
   */
  const postsBeforeRebuild = interviewPostCount();
  const rebuild = await journeyRegionChange(prefix, chest);

  gate(
    "J5.rebuild",
    `${prefix}: changing the region rebuilds the card exactly once`,
    rebuild.problems.length === 0,
    rebuild.problems.length === 0 ? rebuild.detail : rebuild.problems.join("; "),
  );

  // The second state (correction 2): the same journey with a time phrase in an answer, so a duration
  // really is collected and the `How long` row has to appear. It runs here so the gate below can read
  // both cards while the gates that report on the first one keep their order.
  const withDuration = await journeyWithDuration(prefix);

  const firstProblems = cardShapeProblems(firstPayload, firstRows, "");
  const secondProblems =
    withDuration === null
      ? ["the duration session did not complete"]
      : cardShapeProblems(withDuration.payload, withDuration.rows, withDuration.duration);

  gate(
    "J3.fields",
    `${prefix}: the card carries five schema fields, and renders How long only when a duration was collected`,
    firstProblems.length === 0 && secondProblems.length === 0,
    [
      firstProblems.length ? `no duration: ${firstProblems.join("; ")}` : "no duration: 4 rows",
      secondProblems.length ? `with duration: ${secondProblems.join("; ")}` : "with duration: 5 rows",
    ].join(" | "),
  );
  gate("J2.region", `${prefix}: the card names the region the user tapped`, cardText.includes("chest"), cardText.includes("chest") ? "chest" : "region missing");
  gate("P1.line", `${prefix}: the card shows the fixed line`, cardText.includes(DISCLAIMER), cardText.includes(DISCLAIMER) ? "found" : "MISSING");

  /**
   * The check-in's own turns: every one of them carried the region the user tapped. The rebuild round that
   * follows sends the region *that* round tapped, and it is `J5.rebuild`'s subject - so this gate reads the
   * turns up to the rebuild and says so in its evidence line.
   */
  const regionSent = postedBodies
    .filter((p) => p.url.includes("/api/interview"))
    .slice(0, postsBeforeRebuild)
    .map((p) => {
      try {
        return JSON.parse(p.postData).regionLabel;
      } catch {
        return "(unparseable)";
      }
    });
  gate(
    "J4.regionSent",
    `${prefix}: the selected region travels with every interview turn`,
    regionSent.length > 0 && regionSent.every((r) => r === "chest"),
    `regionLabel sent: ${JSON.stringify(regionSent)} (this check-in's own turns; the rebuild round is J5.rebuild)`,
  );

  /**
   * Phase 2D, the two halves that only a real browser can prove: every request this session sent
   * carried the acknowledged provider, and a session that declines sends nothing at all.
   */
  const acknowledged = postedBodies
    .filter((p) => p.url.includes("/api/interview"))
    .map((p) => {
      try {
        return JSON.parse(p.postData)[ACKNOWLEDGED_PROVIDER_FIELD];
      } catch {
        return "(unparseable)";
      }
    });

  gate(
    "P5.acknowledged",
    `${prefix} (${EXPECTED_MODE} mode): every interview request carries the acknowledgement this mode asked for`,
    acknowledged.length > 0 && acknowledged.every((value) => value === EXPECTED.acknowledge),
    `${ACKNOWLEDGED_PROVIDER_FIELD} sent: ${JSON.stringify(acknowledged)} (expected ${EXPECTED.acknowledge})`,
  );

  await declinePass(prefix);
}


/* ------------------------------------------------------------------ the self-test */

/**
 * Proves the gates can fail. Each case breaks one thing on the live page, calls the real gate
 * function into a scratch list, and asserts that the gate flipped. A harness whose gates cannot
 * fail would report green on anything, which is exactly the defect the storage-harness review
 * found in this project before (BUILD-REPORT Entry 8).
 */
async function selfTest() {
  const found = [];

  function probe(id, title, ok, detail) {
    found.push({ id, title, ok: Boolean(ok), detail: String(detail) });
    console.log(`${ok ? "PASS" : "FAIL"}  [${id}] ${title}  [${detail}]`);
  }

  const white = ratio("rgb(255,255,255)", "rgb(0, 0, 0)");
  const grey = ratio("#767676", "#ffffff");
  probe(
    "ST0.maths",
    "the contrast maths matches known WCAG values",
    white !== null && Math.abs(white - 21) < 0.01 && grey !== null && grey >= 4.5 && grey < 4.6,
    `black on white ${white?.toFixed(2)}:1, #767676 on white ${grey?.toFixed(2)}:1`,
  );

  await setViewport(SMALLEST);
  if (!(await goto(`${BASE}/checkin`, "self-test"))) throw new Error(`the app is not reachable at ${BASE}`);
  await settle(400);

  const baseColours = await evaluate(COLOURS);
  const baseScratch = [];
  await withSink(baseScratch, () => contrastGates("self-test", baseColours));
  const baseOutline = baseScratch.find((g) => g.id === "C1.outline")?.ok ?? false;

  // ST1 - D1 tracks the fixed line's position: forced visible -> PASS, hidden -> FAIL.
  await evaluate(`(() => {
    const f = document.querySelector("footer");
    if (!f) return false;
    f.style.position = "fixed";
    f.style.left = "0";
    f.style.right = "0";
    f.style.bottom = "0";
    f.style.background = getComputedStyle(document.body).backgroundColor;
    return true;
  })()`);
  await settle(300);
  const forced = await evaluate(MEASURE);
  const forcedSweep = await evaluate(FOOTER_SWEEP);
  const forcedScratch = [];
  await withSink(forcedScratch, () => disclaimerGates("self-test", forced, forcedSweep, null));
  const d1Forced = forcedScratch.find((g) => g.id === "D1.firstScreen")?.ok ?? false;

  await evaluate(`(() => { const f = document.querySelector("footer"); if (f) f.style.display = "none"; return true; })()`);
  await settle(200);
  const gone = await evaluate(MEASURE);
  const goneSweep = await evaluate(FOOTER_SWEEP);
  const goneScratch = [];
  await withSink(goneScratch, () => disclaimerGates("self-test", gone, goneSweep, null));
  const d1Gone = goneScratch.find((g) => g.id === "D1.firstScreen")?.ok ?? false;

  probe(
    "ST1.footer",
    "D1 follows the fixed line's position (forced visible -> PASS, hidden -> FAIL)",
    d1Forced === true && d1Gone === false,
    `forced=${d1Forced}, hidden=${d1Gone}`,
  );

  await evaluate(`(() => {
    const f = document.querySelector("footer");
    if (f) { f.style.display = ""; f.style.position = ""; f.style.left = ""; f.style.right = ""; f.style.bottom = ""; f.style.background = ""; }
    return true;
  })()`);
  await settle(200);


  // ST2 - L2 detects a zone rectangle that hangs off the figure.
  const originalX = await evaluate(`(() => {
    const r = document.querySelector('svg[role="group"] [role="button"] rect');
    return r ? r.getAttribute("x") : null;
  })()`);
  await evaluate(`(() => {
    const r = document.querySelector('svg[role="group"] [role="button"] rect');
    if (r) r.setAttribute("x", "-60");
    return true;
  })()`);
  await scrollFigureIntoView();
  await settle(250);
  const moved = await evaluate(ALIGNMENT);
  const movedScratch = [];
  await withSink(movedScratch, () => l2Gate("self-test", "moved", moved));
  const l2Moved = movedScratch.find((g) => g.id === "L2.overhang")?.ok ?? false;
  probe("ST2.align", "L2 overhang fails when a zone rectangle is moved off the figure", l2Moved === false, `L2 overhang after moving the first zone rect to x=-60: ${l2Moved}`);

  await evaluate(`(() => {
    const r = document.querySelector('svg[role="group"] [role="button"] rect');
    if (r) r.setAttribute("x", ${JSON.stringify(originalX ?? "0")});
    return true;
  })()`);
  await settle(150);

  // ST3 - C1 detects a zone outline painted the figure's own colour.
  const surface = baseColours.surface;
  await evaluate(`(() => {
    const r = document.querySelector('svg[role="group"] [role="button"] rect');
    if (r) r.style.stroke = ${JSON.stringify(surface ?? "rgb(229, 224, 216)")};
    return true;
  })()`);
  await settle(150);
  const flattened = await evaluate(COLOURS);
  const flatScratch = [];
  await withSink(flatScratch, () => contrastGates("self-test", flattened));
  const c1Flat = flatScratch.find((g) => g.id === "C1.outline")?.ok ?? false;
  probe(
    "ST3.contrast",
    "C1 fails when the zone outline is painted the figure's own colour",
    baseOutline === true && c1Flat === false,
    `outline on figure before=${baseOutline}, after painting it ${surface}=${c1Flat}`,
  );

  await evaluate(`(() => {
    const r = document.querySelector('svg[role="group"] [role="button"] rect');
    if (r) r.style.stroke = "";
    return true;
  })()`);
  await settle(150);

  // ST4 - S2 detects a stretched drawing box.
  await evaluate(`(() => {
    const s = document.querySelector('svg[role="group"]');
    if (s) { s.style.width = "600px"; s.style.height = "200px"; }
    return true;
  })()`);
  await settle(150);
  const stretched = await evaluate(MEASURE);
  const stretchScratch = [];
  await withSink(stretchScratch, () => layoutGates("self-test", stretched));
  const s2Stretched = stretchScratch.find((g) => g.id === "S2.uniform")?.ok ?? false;
  probe("ST4.stretch", "S2 fails when the drawing box is stretched", s2Stretched === false, `S2 with a 600x200 box: ${s2Stretched}`);

  await evaluate(`(() => {
    const s = document.querySelector('svg[role="group"]');
    if (s) { s.style.width = ""; s.style.height = ""; }
    return true;
  })()`);

  // ST5 - L2 coverage detects a drawn area that no zone covers (a visible, untappable body part).
  await evaluate(`(() => {
    const shape = document.querySelector('g[aria-hidden="true"] rect');
    if (!shape) return false;
    window.__somaRestoreShape = { width: shape.getAttribute("width"), height: shape.getAttribute("height") };
    shape.setAttribute("width", String(Number(shape.getAttribute("width")) * 6));
    shape.setAttribute("height", String(Number(shape.getAttribute("height")) * 3));
    return true;
  })()`);
  await scrollFigureIntoView();
  await settle(250);
  const grown = await evaluate(ALIGNMENT);
  const grownScratch = [];
  await withSink(grownScratch, () => l2CoverageGate("self-test", "grown", grown));
  const coverageGrown = grownScratch.find((g) => g.id === "L2.coverage")?.ok ?? false;
  probe(
    "ST5.coverage",
    "L2 coverage fails when the figure is drawn larger than the zones",
    coverageGrown === false,
    `L2 coverage with the first silhouette shape grown 6x3: ${coverageGrown}`,
  );

  await evaluate(`(() => {
    const shape = document.querySelector('g[aria-hidden="true"] rect');
    const saved = window.__somaRestoreShape;
    if (shape && saved) {
      shape.setAttribute("width", saved.width);
      shape.setAttribute("height", saved.height);
    }
    return true;
  })()`);

  // ST6 - C8 detects a page that keeps the visitor's colour scheme, which is the defect this gate exists
  // for: the paper is the product's, so repainting it with the dark palette must fail.
  await evaluate(`(() => {
    document.body.style.backgroundColor = "rgb(20, 18, 15)";
    return true;
  })()`);
  await settle(150);
  const repainted = await evaluate(COLOURS);
  const repaintedScratch = [];
  await withSink(repaintedScratch, () => contrastGates("self-test", repainted));
  const c8Repainted = repaintedScratch.find((g) => g.id === "C8.pinned")?.ok ?? false;
  const c8Base = baseScratch.find((g) => g.id === "C8.pinned")?.ok ?? false;
  probe(
    "ST6.pinned",
    "C8 fails when the page is repainted with the dark palette",
    c8Base === true && c8Repainted === false,
    `C8 on the app=${c8Base}, after painting the page rgb(20, 18, 15)=${c8Repainted}`,
  );

  await evaluate(`(() => { document.body.style.backgroundColor = ""; return true; })()`);
  await settle(150);

  // ST7 - C9 detects a document that asks for dark native controls.
  await evaluate(`(() => { document.documentElement.style.colorScheme = "dark"; return true; })()`);
  await settle(150);
  const darkControls = await evaluate(COLOURS);
  const darkControlsScratch = [];
  await withSink(darkControlsScratch, () => contrastGates("self-test", darkControls));
  const c9Dark = darkControlsScratch.find((g) => g.id === "C9.native")?.ok ?? false;
  const c9Base = baseScratch.find((g) => g.id === "C9.native")?.ok ?? false;
  probe(
    "ST7.native",
    "C9 fails when the document asks for dark native controls",
    c9Base === true && c9Dark === false,
    `C9 on the app=${c9Base}, with color-scheme forced to dark=${c9Dark}`,
  );

  await evaluate(`(() => { document.documentElement.style.colorScheme = ""; return true; })()`);
  await settle(150);

  const passed = found.filter((f) => f.ok).length;
  console.log("");
  console.log(`self-test: ${passed}/${found.length} passed`);

  return { cases: found, passed, total: found.length, ok: passed === found.length };
}


/* ------------------------------------------------------------------------- the run */

async function main() {
  const started = Date.now();
  let chromePath = "(not launched)";
  let selfTestResult = null;
  let fatal = null;

  try {
    let status = null;
    try {
      status = (await fetch(`${BASE}/checkin`, { signal: AbortSignal.timeout(5000) })).status;
    } catch (error) {
      console.log(`the app is not reachable at ${BASE}: ${error.message}`);
      console.log("Start the production build first:");
      console.log("  npm run build");
      console.log(`  npx next start -p ${new URL(BASE).port || "3000"}`);
      process.exitCode = 2;
      return;
    }

    gate("P0.server", `the app answers over HTTP at ${BASE}`, status === 200, `status ${status}`);

    if (status !== 200) {
      console.log(`the app answered ${status} at ${BASE}; the harness needs a 200 from /checkin`);
      process.exitCode = 2;
      return;
    }

    chromePath = launchChrome();
    const targets = await listTargets();
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("no page target over CDP");

    await connect(page.webSocketDebuggerUrl);
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Network.enable");

    if (!(await goto(`${BASE}/checkin`, "preflight", 6))) {
      gate("P0.map", "the browser reaches the app and renders the body map", false, "gave up after 6 attempts");
      process.exitCode = 2;
      return;
    }
    gate("P0.map", "the browser reaches the app and renders the body map", true, "body map present");

    if (SELF_TEST) {
      selfTestResult = await selfTest();
      return;
    }

    // 1. the viewport sweep: layout, touch targets, the map's space, the fixed line, compliance.
    for (const viewport of VIEWPORTS) {
      const prefix = `${viewport.name} ${viewport.mode}`;
      await setViewport(viewport);
      if (!(await goto(`${BASE}/checkin`, prefix))) continue;

      await evaluate("document.fonts.ready.then(() => true)");
      await evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250))))`);

      // The gates below read the map, so open it where this viewport starts with it closed (Phase 2H).
      await setMapOpen(true);

      const m = await evaluate(MEASURE);
      measurements[prefix] = m;
      await shot(`p2-${viewport.name}-${viewport.mode}`);

      layoutGates(prefix, m);
      complianceGates(prefix, m);

      const sweep = await evaluate(FOOTER_SWEEP);
      let focused = null;
      let focusedRect = null;

      // A4's third condition: the fixed line with the description field focused, at 320 wide.
      if (viewport.width === 320) {
        // Measured in the state the screen starts in: on a short viewport that is the map closed.
        await setMapOpen(false);

        await evaluate(`(() => {
          const f = document.querySelector("textarea, input[type=text]");
          if (f) { f.scrollIntoView({ block: "center" }); f.focus(); }
          return true;
        })()`);
        await settle(300);
        focused = await evaluate(MEASURE);
        focusedRect = await evaluate(`(() => {
          const el = document.activeElement;
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
        })()`);
      }

      disclaimerGates(prefix, m, sweep, focused, focusedRect);

      if (viewport.width === 320) {
        await evaluate(`(() => { const a = document.activeElement; if (a && a.blur) a.blur(); return true; })()`);
        await settle(150);
      }
    }

    // 2. naming, measured once: the figure and view groups the plan names.
    await setViewport(ALIGN_AT[0]);
    if (await goto(`${BASE}/checkin`, "naming")) {
      await evaluate("document.fonts.ready.then(() => true)");
      await settle(300);
      await setMapOpen(true);
      namingGates(await evaluate(MEASURE));
    }


    // 3. the alignment sweep and the rendered-colour pass.
    for (const viewport of ALIGN_AT) {
      const prefix = `${viewport.name} ${viewport.mode}`;
      await setViewport(viewport);
      if (!(await goto(`${BASE}/checkin`, prefix))) continue;

      await evaluate("document.fonts.ready.then(() => true)");
      await settle(300);

      // The alignment sweep reads the map, so open it where it starts closed (Phase 2H fix).
      await setMapOpen(true);

      const sizing = {};
      await alignmentPass(viewport, sizing);
      sizingGates(prefix, sizing);

      // A selected zone is needed before the selected-fill pair exists in the DOM.
      const m = await evaluate(MEASURE);
      const zone = m.zones.find((z) => (z.label || "").includes("chest")) ?? m.zones[0];
      if (zone) {
        await clickAt(zone.centre.x, zone.centre.y);
        await settle(250);
      }

      contrastGates(prefix, await evaluate(COLOURS));

      if (viewport.width === 390 && viewport.mode === "light") {
        await scrollFigureIntoView();
        await settle(200);
        await shot("p2-390-light-tapped");
      }
    }

    // 4. the journey: the same path a user walks, so a compliance regression shows up here.
    if (!QUICK) {
      await setViewport({ name: "390x844", width: 390, height: 844, dsf: 2, mode: "light" });
      await journeyPass();
    }

    gate("P3.console", "no browser errors anywhere in the run", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "none");
  } catch (error) {
    fatal = error;
  } finally {
    stopChrome();
    try {
      if (ws) ws.close();
    } catch {
      /* nothing to close */
    }

    const report = {
      phase: "SomaMap Phase 2.0 - the visual harness",
      generatedAt: new Date().toISOString(),
      base: BASE,
      cdp: CDP,
      chrome: chromePath,
      repo: REPO,
      outDir: OUT,
      mapSpaces: MAP_SPACES,
      viewports: VIEWPORTS.map((v) => `${v.name} ${v.mode}`),
      alignAt: ALIGN_AT.map((v) => `${v.name} ${v.mode}`),
      screenshots,
      gateCount: gates.length,
      failures: failureCount(),
      gates,
      notes,
      consoleErrors,
      postedApiRequests: postedBodies,
      measurements,
      selfTest: selfTestResult,
      fatal: fatal ? String(fatal.message ?? fatal) : null,
      durationMs: Date.now() - started,
    };

    writeFileSync(join(OUT, "somamap-phase2-report.json"), JSON.stringify(report, null, 2), "utf8");

    console.log("");
    console.log("=== SUMMARY ===");
    console.log(`base: ${BASE}   chrome: ${chromePath}`);
    console.log(`gates: ${gates.length - failureCount()} passed, ${failureCount()} failed (of ${gates.length})`);
    console.log(`screenshots: ${screenshots.length} -> ${OUT}`);
    console.log(`console errors: ${consoleErrors.length}`);
    if (selfTestResult) console.log(`self-test: ${selfTestResult.passed}/${selfTestResult.total}`);
    console.log(`report: ${join(OUT, "somamap-phase2-report.json")}`);
    if (fatal) console.log(`HARNESS ERROR: ${fatal.message ?? fatal}`);
    console.log(
      `HARNESS RESULT: ${
        fatal ? "did not complete" : failureCount() === 0 ? "PASS (every gate)" : `FAIL (${failureCount()} gate(s))`
      }`,
    );
  }

  if (fatal) {
    process.exitCode = 2;
    return;
  }

  if (SELF_TEST) {
    process.exitCode = selfTestResult && selfTestResult.ok ? 0 : 1;
    return;
  }

  process.exitCode = failureCount() === 0 ? 0 : 1;
}

await main();

