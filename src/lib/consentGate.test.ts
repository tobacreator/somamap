import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The consent gate, held still (`ISS-21`).
 *
 * The disclosure screen was reworded and re-laid-out, and the one thing that must not move with it is
 * the gate itself: the interview is unreachable until the person acknowledges, nothing is sent before
 * they do, and the server refuses a turn that carries no acknowledgement whichever way the screen was
 * reached. Those are structural facts, so they are checked structurally - by position in the source -
 * rather than by looking at the rendered words.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function source(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

describe("the interview cannot be reached without the disclosure", () => {
  const flow = source("src/components/CheckInFlow.tsx");
  const notice = source("src/components/ExternalProcessingNotice.tsx");
  const interview = source("src/lib/interview.ts");

  it("renders the notice at the disclosure step, and the interview only after it", () => {
    assert.ok(flow.includes("<ExternalProcessingNotice"));
    assert.ok(flow.includes('if (step === "disclosure")'));
    assert.ok(flow.includes('if (step === "interview")'));
    assert.ok(
      flow.indexOf('if (step === "disclosure")') < flow.indexOf('if (step === "interview")'),
      "the disclosure is the earlier branch, so it is what a person sees first",
    );
  });

  it("has exactly one way into the interview, and it is the acknowledgement", () => {
    const transitions = [...flow.matchAll(/setStep\("interview"\)/g)];

    assert.equal(transitions.length, 1, "one transition, not several");
    assert.ok(
      flow.indexOf("onAcknowledge") !== -1 && flow.indexOf("onAcknowledge") < flow.indexOf('setStep("interview")'),
      "and it belongs to the acknowledgement handler",
    );
  });

  it("mounts the interview only in the interview step, so nothing is sent before consent", () => {
    assert.ok(flow.includes("<InterviewChat"));
    assert.ok(flow.indexOf("<InterviewChat") > flow.indexOf('if (step === "interview")'));
  });

  it("keeps the server's own refusal for a turn with no acknowledgement", () => {
    assert.ok(interview.includes("isAcknowledgement(parsed.acknowledgedProvider, deps.mode)"));
    assert.ok(
      interview.indexOf("isAcknowledgement(") < interview.indexOf("wordCard("),
      "the acknowledgement is checked before anything is worded",
    );
  });

  it("is the same gate whether the check-in is opened directly or from the journal", () => {
    assert.ok(source("src/app/journal/page.tsx").includes('href="/checkin"'), "the journal links to the check-in");
    assert.ok(source("src/app/checkin/page.tsx").includes("CheckInFlow"), "and the check-in renders the flow");
    assert.ok(flow.includes("<ExternalProcessingNotice"), "which holds the disclosure");
  });

  it("offers the two controls the harness drives, and an accessible expander for the detail", () => {
    assert.ok(notice.includes('id="external-processing-acknowledge"'));
    assert.ok(notice.includes('id="external-processing-decline"'));
    assert.ok(notice.includes("<details"));
    assert.ok(notice.includes("<summary"));
  });

  it("never puts the fact that data leaves the product only inside the expander", () => {
    // The visible sentence carries it; the expander adds the provider's name and the detail.
    assert.ok(notice.includes("{disclosure.data}"));
    assert.ok(notice.indexOf("{disclosure.data}") < notice.indexOf("<details"));
  });
});
