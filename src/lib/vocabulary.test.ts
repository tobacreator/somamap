import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DISCLAIMER_LINE,
  INTERVIEW_COMPLETING,
  INTERVIEW_LOADING,
  INTERVIEW_VOCABULARY_NOTE,
  INTERVIEW_VOCABULARY_SUMMARY,
} from "./copy.ts";
import { afterResponse } from "./interviewFlow.ts";
import { interviewStep } from "./interview.ts";
import { mockAdapter } from "./models.ts";
import { SENSATION_VOCABULARY, addWordToAnswer, answerHasWord } from "./vocabulary.ts";

/**
 * Vocabulary discovery (`ISS-22`).
 *
 * The product's premise is that a person may feel something and have no words for it. These tests hold
 * the three properties that make the answer safe and useful: the candidate words describe texture and
 * nothing else; a word reaches the person's answer only when they choose it, and their own words are
 * never touched; and a word they ignored never appears on the card, while one they accepted does.
 *
 * The card is built by the real state machine with the real mock adapter, so "accepted words are in the
 * card" is a fact about the pipeline rather than about a helper in isolation. No network, no provider.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function source(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

/** The words the brief names, as the demo vocabulary. */
const NAMED = ["fluttering", "vibrating", "pulsing", "rippling", "tingling", "faint", "steady", "wave-like"];

/**
 * Shapes a candidate word or its explanation must never carry: a cause, a condition, an action, or a
 * word that tells the reader what to do.
 *
 * Iron rule 5's four forbidden stems are deliberately **not** written down here, for the same reason
 * `externalProcessing.test.ts` and `draftGuard.ts` do not write them down: putting them in `src/` is
 * exactly what the copy scan exists to prevent, and T5 scans `src/lib` - this file and `vocabulary.ts`
 * included - on every pack run. The scan owns those words; this list owns the clinical and instructive
 * vocabulary it does not look for.
 */
const NEVER = [
  "cause",
  "because",
  "means",
  "sign of",
  "condition",
  "disorder",
  "syndrome",
  "disease",
  "doctor",
  "hospital",
  "medicine",
  "should",
  "try to",
  "recommend",
];

describe("the candidate vocabulary", () => {
  it("offers the brief's words, each with a plain explanation", () => {
    const words = SENSATION_VOCABULARY.map((candidate) => candidate.word);

    for (const word of NAMED) {
      assert.ok(words.includes(word), `${word} must be offered`);
    }

    assert.equal(new Set(words).size, words.length, "no duplicates");
    assert.ok(SENSATION_VOCABULARY.length <= 10, "short enough to read at a glance");

    for (const candidate of SENSATION_VOCABULARY) {
      assert.ok(candidate.word.length > 2, candidate.word);
      assert.ok(candidate.meaning.length > 10, `${candidate.word} needs a real explanation`);
    }
  });

  it("describes texture only: no cause, condition, action or rule-5 word", () => {
    for (const candidate of SENSATION_VOCABULARY) {
      const text = `${candidate.word} ${candidate.meaning}`.toLowerCase();

      for (const forbidden of NEVER) {
        assert.equal(text.includes(forbidden), false, `${candidate.word}: "${forbidden}" must not appear`);
      }
    }
  });
});

describe("adding a candidate word to the answer", () => {
  it("gives a person with no words a word to start from", () => {
    assert.equal(addWordToAnswer("", "fluttering"), "fluttering");
    assert.equal(addWordToAnswer("   ", "steady"), "steady");
  });

  it("keeps the person's own words exactly as they were", () => {
    const own = "it feels like something is moving in there";

    assert.equal(addWordToAnswer(own, "fluttering"), `${own}, fluttering`);
    assert.ok(addWordToAnswer(own, "fluttering").startsWith(own), "nothing already written is reworded");
  });

  it("never adds the same word twice, whatever the case", () => {
    assert.equal(addWordToAnswer("Fluttering in my chest", "fluttering"), "Fluttering in my chest");
    assert.equal(addWordToAnswer("a steady hum", "steady"), "a steady hum");
  });

  it("matches the word as a whole word", () => {
    assert.equal(answerHasWord("it feels unsteady", "steady"), false);
    assert.equal(addWordToAnswer("it feels unsteady", "steady"), "it feels unsteady, steady");
  });
});

describe("an accepted word reaches the card, an ignored one does not", () => {
  const DEPS = { adapter: mockAdapter, logger: () => {}, mode: "mock" as const };
  const DESCRIPTION = "A band across my chest";

  /** A complete session whose second answer is whatever the person ended up writing. */
  async function cardFor(secondAnswer: string) {
    const result = await interviewStep(
      {
        answers: [
          { questionId: "Q1", text: "it stays in one spot" },
          { questionId: "Q4", text: secondAnswer },
        ],
        text: "like a band pulled too tight",
        regionLabel: "chest",
        description: DESCRIPTION,
        acknowledgedProvider: "local",
      },
      DEPS,
    );

    assert.equal(result.status, "complete");

    return result.status === "complete" ? result.card : null;
  }

  it("includes a word the person accepted", async () => {
    const card = await cardFor(addWordToAnswer("tight", "fluttering"));

    assert.ok(card !== null);
    assert.ok(
      card.quality_words.some((word) => word.toLowerCase() === "fluttering"),
      JSON.stringify(card.quality_words),
    );
  });

  it("leaves out a word the person ignored", async () => {
    const card = await cardFor("tight");

    assert.ok(card !== null);
    assert.equal(card.quality_words.some((word) => word.toLowerCase() === "fluttering"), false);
  });

  it("keeps the person's own sentence and the card's five fields", async () => {
    const card = await cardFor(addWordToAnswer("tight", "fluttering"));

    assert.ok(card !== null);
    assert.deepEqual(Object.keys(card).sort(), [
      "duration",
      "intensity_metaphor",
      "location_label",
      "quality_words",
      "user_own_sentence",
    ]);
    assert.equal(card.location_label, "chest");
    assert.ok(card.quality_words.length <= 5);
    assert.ok(
      [DESCRIPTION, "it stays in one spot", "tight, fluttering", "like a band pulled too tight"].includes(
        card.user_own_sentence,
      ),
      card.user_own_sentence,
    );
  });

  it("carries no interpretation, cause or instruction", async () => {
    const card = await cardFor(addWordToAnswer("tight", "fluttering"));
    const text = JSON.stringify(card).toLowerCase();

    for (const forbidden of NEVER) {
      assert.equal(text.includes(forbidden), false, forbidden);
    }
  });
});

describe("the interview's states stay honest", () => {
  it("does not skip a question when a turn fails", () => {
    const asking = {
      phase: "asking" as const,
      question: { id: "Q4", text: "a question" },
      answers: [{ questionId: "Q1", text: "an answer" }],
      asked: [{ id: "Q1", text: "a question" }],
    };
    const failed = afterResponse(asking, { status: "nonsense" });

    assert.equal(failed.phase, "failed");
    assert.equal("question" in failed, false, "no question travels with a failure, so none can be skipped");
    assert.ok(source("src/components/InterviewChat.tsx").includes("await send(last.request, last.previous);"));
  });

  it("says the card is being built on the completing turn, and a question is coming otherwise", () => {
    const chat = source("src/components/InterviewChat.tsx");

    assert.notEqual(INTERVIEW_COMPLETING, INTERVIEW_LOADING);
    assert.ok(chat.includes("{completing ? INTERVIEW_COMPLETING : INTERVIEW_LOADING}"));
    assert.ok(chat.includes('flow.phase === "submitting" && flow.answers.length >= QUESTIONS_PER_SESSION'));
  });

  it("stops waiting rather than hanging, and offers a retry", () => {
    const chat = source("src/components/InterviewChat.tsx");

    assert.ok(chat.includes("signal: AbortSignal.timeout(INTERVIEW_TIMEOUT_MS)"));
    assert.ok(chat.includes("{INTERVIEW_RETRY}"));
  });

  it("saves a finished card once, guarded by the completed state itself", () => {
    const chat = source("src/components/InterviewChat.tsx");

    assert.ok(chat.includes("if (saved.current === flow) return;"));
    assert.ok(chat.includes("saved.current = flow;"));
    assert.equal([...chat.matchAll(/postJournalCard\(card, view\)/g)].length, 1, "one write site, once per card");
  });

  it("adds a suggested word without sending anything anywhere", () => {
    const chat = source("src/components/InterviewChat.tsx");
    const helper = chat.slice(chat.indexOf("<details"), chat.indexOf("</details>"));

    assert.ok(helper.length > 0, "the helper is rendered");
    assert.ok(helper.includes("addWordToAnswer(text, candidate.word)"));
    assert.equal(helper.includes("fetch("), false, "the helper edits the answer; it sends nothing");
    assert.ok(helper.includes("disabled={busy}"), "and it cannot be used mid-turn");
  });

  it("keeps the helper's promise visible: suggestions, and nothing added unless tapped", () => {
    assert.ok(/suggestions only/i.test(INTERVIEW_VOCABULARY_NOTE));
    assert.ok(/unless you tap/i.test(INTERVIEW_VOCABULARY_NOTE));
    assert.ok(/try a word/i.test(INTERVIEW_VOCABULARY_SUMMARY));
    assert.notEqual(INTERVIEW_VOCABULARY_NOTE, DISCLAIMER_LINE);
  });
});
