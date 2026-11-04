import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The motion layer (`ISS-28`), held to the rules it claims.
 *
 * Animation cannot be tested in a browser here, but the properties that keep it from becoming a liability
 * can be read from the source: it is switched off when the operating system asks, it is short enough that
 * the visual harness measures a settled screen, it animates nothing that reflows, and the one waiting mark
 * is driven by the interview's real state rather than by a timer.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
const chat = readFileSync(join(ROOT, "src/components/InterviewChat.tsx"), "utf8");

describe("the motion layer", () => {
  it("switches every animation off when the operating system asks for less motion", () => {
    const at = css.indexOf("@media (prefers-reduced-motion: reduce)");

    assert.ok(at !== -1, "there must be a reduced-motion rule");

    const block = css.slice(at);

    for (const className of [".motion-arrive", ".motion-chip", ".motion-wait"]) {
      assert.ok(block.includes(className), `${className} must be covered by the rule`);
    }

    assert.ok(block.includes("animation: none"), "the rule must actually remove the animations");
  });

  it("keeps every animation inside the window the visual harness waits before measuring", () => {
    // The harness settles with two animation frames and 250 ms. Anything longer is measured mid-flight,
    // which would make the layout gates flaky rather than wrong - so the durations stay under it.
    const durations = [...css.matchAll(/--duration-(?:quick|settle):\s*(\d+)ms/g)].map((match) =>
      Number(match[1]),
    );

    assert.ok(durations.length >= 2, "both durations must be declared");

    for (const ms of durations) assert.ok(ms <= 250, `${ms}ms is longer than the settle window`);

    // The helper's stagger is capped, so the last chip has settled by the same deadline.
    assert.ok(chat.includes("Math.min(index, 5) * 25"), "the chip stagger must be bounded");
  });

  it("animates opacity and transform only, so nothing reflows while it runs", () => {
    const frames = css.slice(css.indexOf("@keyframes somamap-arrive"), css.indexOf(".motion-arrive"));

    assert.ok(frames.includes("opacity"));
    assert.ok(frames.includes("transform"));

    for (const layoutProperty of ["width", "height", "margin", "padding", "font-size", "top:", "left:"]) {
      assert.equal(frames.includes(layoutProperty), false, `${layoutProperty} must not be animated`);
    }
  });

  it("drives the waiting mark from the turn in flight, and hides it from assistive technology", () => {
    const mark = chat.indexOf("motion-wait");
    const busy = chat.lastIndexOf("{busy ?", mark);

    assert.ok(mark !== -1, "the mark must be rendered");
    assert.ok(busy !== -1 && busy < mark, "the mark must sit inside the turn-in-flight branch");
    assert.ok(
      chat.includes('aria-hidden="true" className="motion-wait'),
      "the mark is decoration: the sentence beside it carries the meaning",
    );
  });

  it("shows the person their own words back, verbatim, and only when they wrote some", () => {
    assert.ok(chat.includes("const echo = answersOf(flow).length === 0"));
    assert.ok(chat.includes("description.trim().length > 0 ? description : null"));
    assert.ok(chat.includes("{echo}</span>"), "the echo renders the description itself");
    assert.equal(
      /echo[\s\S]{0,200}(paraphrase|rewrite|summar)/i.test(chat),
      false,
      "the echo is the person's text, never a rewritten version of it",
    );
  });

  it("keys the question's arrival animation to the question, so it runs for each one", () => {
    assert.ok(chat.includes('<header key={question.id} className="motion-arrive'));
  });
});
