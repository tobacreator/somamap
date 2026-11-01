# SomaMap visual harness

A standalone, dependency-free browser harness for the body-map work. It drives the **production**
build of the app in the Chrome already cached on this machine, over the DevTools Protocol, using
only Node's built-in `fetch` and `WebSocket`, and reports a named set of acceptance gates.

It is **not** part of `npm test`, the unit suite, or the red-team pack. Run it by hand.

## Why it exists

The Phase 1 feedback loop produced 30 failures in four families:

| Family | Baseline (Phase 1) |
|---|---|
| zones smaller than 44x44 CSS px | 8 failures (smallest 18.2x23) |
| the drawing space does not match the map's authored space | 8 failures (y rendered 1.60x x) |
| an interactive control under 44px tall | 8 failures (smallest "Region neck") |
| the fixed line below the fold | 6 failures (footer y=1068 in an 800px viewport) |

Every later phase of the body-map plan is judged against those families plus the alignment gates
(L1/L2/L3) that decide whether the drawn silhouette and the fixed zone map actually agree. Those
judgements must be measurements, so they live here, once, and are re-run after every change.

## Running it

```powershell
npm run build
npx next start -p 3311            # in one terminal
node tools/visual-harness/run.mjs # in another
```

Options:

| Flag / variable | Effect |
|---|---|
| `--quick` | one viewport (320x568), no journey |
| `--self-test` | gate-mechanics check only: it breaks the live page and asserts the gates flip |
| `SOMAMAP_BASE` | the server to drive (default `http://127.0.0.1:3311`) |
| `SOMAMAP_CDP_PORT` | Chrome's debugging port (default `9228`) |
| `SOMAMAP_OUT` | where screenshots and the report go (default `%TEMP%\somamap-phase2`) |
| `SOMAMAP_CHROME` | an explicit `chrome.exe` (default: the cached Puppeteer build) |
| `SOMAMAP_KEEP_CHROME=1` | leave the launched Chrome running |

Exit codes: `0` every gate passed, `1` at least one gate failed, `2` the run could not start (no
server, no Chrome, or the harness itself threw).

## The gates

| Id | What it asserts |
|---|---|
| `P0.server`, `P0.map` | the app answers, and the browser renders the body map |
| `L1.form` | the view draws a silhouette and the expected zone controls |
| `L2.overhang` | no zone outline leaves the body (the perimeter is walked every 3px, half a pixel inside) |
| `L2.coverage` | every drawn part of the body can be tapped (a visible area with no zone under it fails) |
| `L3.tap` | a trusted tap on a zone names exactly that zone, one pressed zone, pin inside it |
| `S1.height` | every view renders at the same height |
| `S2.uniform` | the drawing box does not stretch the viewBox |
| `S3.mapspace` | the drawing declares the map space it was authored in (`data-map-*`), that space is one `src/lib/regions.ts` declares, and the viewBox does not stretch it |
| `S4.side` | the side view is narrower than the front |
| `S5.aspect` | every view keeps its own proportions |
| `T1.zone44`, `T2.control44` | touch-target floors (44x44, 44px tall) |
| `T3.scroll`, `T4.overlap`, `T5.clip`, `T6.overflow` | layout defects |
| `D1.firstScreen` | the fixed line is visible on the first screen (including 320x568) |
| `D2.scrolling` | the fixed line stays visible at every sampled scroll position |
| `D3.focus` | the fixed line is visible with the description field focused at 320x568, and does not cover it |
| `D4.noOcclusion` | the fixed line never covers an interactive control |
| `C1`-`C7` | contrast, recomputed from the colours the browser actually rendered |
| `N1.figure`, `N2.views`, `N3.optional` | the approved naming, and the optional description field |
| `P1.line`, `P2.copy` | the fixed line is rendered; no prohibited word is rendered |
| `P3.console` | no browser errors during the run |
| `J1`-`J4` | the journey: three answers complete the card, which carries the tapped region |

### The L2 taxonomy

The strict containment rule is split so a legitimate contour is never confused with a defect:

| Reading | Meaning | Verdict |
|---|---|---|
| **Contour** | a zone edge that coincides with the silhouette's edge: no off-perimeter samples | legitimate |
| **Overhang** | zone geometry outside the silhouette: the outline leaves the body | failure |
| **Coverage** | silhouette area no zone covers: a visible but untappable body part | failure |

The 0.5px inset in the perimeter walk keeps the sample off the antialiased edge itself. It is a
sampling detail, not a permitted error budget: a zone outline drawn outside the body is a defect
however small, because the user can see it. No threshold is loosened to make a run pass.

## Boundaries it keeps

- **No dependency, no build step, no config file.** Node built-ins and the cached Chrome only.
- **Nothing is written inside the repository.** Screenshots, the JSON report and Chrome's throw-away
  profile go to `%TEMP%` (`SOMAMAP_OUT`).
- **Read-only against the app.** It clicks, types and scrolls. It never reads `.env.local`, never
  touches a database or Storage, and never writes a session row.
- **It can fail, and it proves it.** `--self-test` breaks one thing at a time on the live page and
  asserts the corresponding gate flips to FAIL. A harness whose gates cannot fail proves nothing
  (see BUILD-REPORT Entry 8).
