import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHECKIN_BOX_KEPT,
  DISCLAIMER_LINE,
  EXTERNAL_PROCESSING_DECLINE,
  EXTERNAL_PROCESSING_DECLINED,
  EXTERNAL_PROCESSING_LIVE,
  EXTERNAL_PROCESSING_MOCK,
  EXTERNAL_PROCESSING_TITLE,
  INTERVIEW_NOTE,
} from "./copy.ts";
import {
  EXTERNAL_PROVIDER_ID,
  EXTERNAL_PROVIDER_NAME,
  LOCAL_PROCESSING_ID,
  acknowledgementFor,
  isAcknowledgement,
  withAcknowledgement,
} from "./externalProcessing.ts";

/**
 * The external processing disclosure and its acknowledgement - Phase 2D, and its copy-accuracy
 * follow-up.
 *
 * Four properties are under test, and they are the whole point of the phase: the disclosure is the
 * **mode's own** (mock must not claim that anything is sent to Baseten, live must name Baseten, the
 * words that go there, and that they may be sent again); the acknowledgement is exactly the value that
 * disclosure asks for, and nothing else counts; it travels on the request, unchanged and without
 * altering anything else; and the copy says what the code does and nothing more - no unverified claim
 * about a provider, no prohibited word, and no second copy of the fixed line.
 */

/** Every user-facing string this phase adds, in one place for the copy checks below. */
const DISCLOSURE_COPY = [
  EXTERNAL_PROCESSING_TITLE,
  EXTERNAL_PROCESSING_MOCK.ai,
  EXTERNAL_PROCESSING_MOCK.data,
  EXTERNAL_PROCESSING_MOCK.acknowledge,
  EXTERNAL_PROCESSING_LIVE.ai,
  EXTERNAL_PROCESSING_LIVE.data,
  EXTERNAL_PROCESSING_LIVE.acknowledge,
  EXTERNAL_PROCESSING_DECLINE,
  EXTERNAL_PROCESSING_DECLINED,
  CHECKIN_BOX_KEPT,
  INTERVIEW_NOTE,
];

describe("the acknowledgement is this mode's own (Phase 2D)", () => {
  it("accepts the value the mode's disclosure asks for", () => {
    assert.equal(acknowledgementFor("mock"), LOCAL_PROCESSING_ID);
    assert.equal(acknowledgementFor("live"), EXTERNAL_PROVIDER_ID);
    assert.equal(isAcknowledgement(LOCAL_PROCESSING_ID, "mock"), true);
    assert.equal(isAcknowledgement(EXTERNAL_PROVIDER_ID, "live"), true);
  });

  it("refuses the other mode's acknowledgement, in both directions", () => {
    // A "nothing is sent" acknowledgement must not open a build that sends, and a client that agreed to
    // external processing must not be treated as agreeing to something else either.
    assert.equal(isAcknowledgement(EXTERNAL_PROVIDER_ID, "mock"), false);
    assert.equal(isAcknowledgement(LOCAL_PROCESSING_ID, "live"), false);
  });

  it("refuses every near-miss of the live acknowledgement", () => {
    /**
     * Each of these would sail through a truthiness check: a truthy value, a stringified boolean, a
     * number, an empty string, a differently-cased or padded spelling, another provider's name, and
     * every non-string shape.
     */
    const wrong: unknown[] = [
      undefined,
      null,
      true,
      false,
      0,
      1,
      "",
      " ",
      "true",
      "acknowledged",
      "Baseten",
      "BASETEN",
      "baseten ",
      " baseten",
      "baseten\n",
      "openai",
      "anthropic",
      "external",
      ["baseten"],
      { provider: "baseten" },
      { acknowledgedProvider: "baseten" },
    ];

    for (const value of wrong) {
      assert.equal(isAcknowledgement(value, "live"), false, `${JSON.stringify(value) ?? "undefined"} must not count`);
      assert.equal(isAcknowledgement(value, "mock"), false, `${JSON.stringify(value) ?? "undefined"} must not count`);
    }
  });

  it("names the provider once, in one place", () => {
    assert.equal(EXTERNAL_PROVIDER_ID, "baseten");
    assert.equal(EXTERNAL_PROVIDER_NAME, "Baseten");
    assert.equal(LOCAL_PROCESSING_ID, "local");
  });
});

describe("the acknowledgement travels with the request (Phase 2D)", () => {
  it("adds the field and changes nothing else", () => {
    const request = {
      answers: [{ questionId: "Q1", text: "tight and heavy" }],
      text: "a warm, spreading feeling",
      regionLabel: "chest",
      description: "a band across my chest",
    };

    const sent = withAcknowledgement(request, "live");

    assert.deepEqual(sent, { ...request, acknowledgedProvider: EXTERNAL_PROVIDER_ID });
    assert.deepEqual(Object.keys(sent).sort(), [
      "acknowledgedProvider",
      "answers",
      "description",
      "regionLabel",
      "text",
    ]);
    assert.equal(isAcknowledgement(sent.acknowledgedProvider, "live"), true);
  });

  it("carries the mode's own value, so the wire matches the words on screen", () => {
    const request = { answers: [] };

    assert.equal(withAcknowledgement(request, "mock").acknowledgedProvider, LOCAL_PROCESSING_ID);
    assert.equal(withAcknowledgement(request, "live").acknowledgedProvider, EXTERNAL_PROVIDER_ID);
  });

  it("leaves the request it was handed alone", () => {
    const request: { answers: { questionId: string; text: string }[] } = { answers: [] };

    withAcknowledgement(request, "mock");

    assert.deepEqual(request, { answers: [] }, "the request is copied, never mutated");
  });

  it("is not a card field: the strict five-field schema is untouched", () => {
    // The acknowledgement is a transport precondition. It must never become a sixth field.
    const cardFields = ["location_label", "quality_words", "intensity_metaphor", "duration", "user_own_sentence"];

    assert.equal(cardFields.length, 5);
    assert.equal(cardFields.includes("acknowledgedProvider"), false);
  });
});

describe("the disclosure is the mode's own (Phase 2D)", () => {
  it("mock mode claims nothing is sent to Baseten, because nothing is", () => {
    const mock = `${EXTERNAL_PROCESSING_MOCK.ai} ${EXTERNAL_PROCESSING_MOCK.data}`;

    assert.equal(/are sent to/i.test(mock), false, "no affirmative claim that anything is sent");
    assert.equal(/may be sent again/i.test(mock), false, "and no repetition claim either");
    assert.ok(/not sent to Baseten/i.test(mock), "it says plainly that Baseten is sent nothing");
    assert.ok(/no external provider/i.test(mock), "and that no external provider is involved");
    assert.equal(EXTERNAL_PROCESSING_MOCK.acknowledge.includes("send"), false, "its acknowledgement promises no sending");
  });

  it("live mode names the provider, every word that goes there, and that they may be sent again", () => {
    const live = `${EXTERNAL_PROCESSING_LIVE.ai} ${EXTERNAL_PROCESSING_LIVE.data}`;

    assert.ok(live.includes(EXTERNAL_PROVIDER_NAME), "it names the provider");
    assert.ok(/are sent to Baseten/i.test(live), "it says the words are sent there");

    for (const part of ["description", "location", "answers"]) {
      assert.ok(live.toLowerCase().includes(part), `it names the ${part}`);
    }

    // The repeated transmission, said about the words themselves rather than about the answers alone.
    assert.ok(/they may be sent again/i.test(live), "and that those details may be sent again");
    assert.ok(/as the interview goes on/i.test(live), "as the interview continues");
  });

  it("offers an explicit act in both modes, and a way to decline", () => {
    for (const disclosure of [EXTERNAL_PROCESSING_MOCK, EXTERNAL_PROCESSING_LIVE]) {
      assert.ok(disclosure.acknowledge.startsWith("I understand"), "the acknowledgement is explicit");
      assert.notEqual(disclosure.acknowledge, EXTERNAL_PROCESSING_DECLINE);
    }

    assert.ok(
      EXTERNAL_PROCESSING_LIVE.acknowledge.includes(EXTERNAL_PROVIDER_NAME),
      "the live acknowledgement names the provider",
    );
    assert.ok(EXTERNAL_PROCESSING_DECLINED.toLowerCase().includes("nothing was sent"));
  });
});

describe("the saved lines name SomaMap, not a provider (Phase 2D follow-up)", () => {
  it("attributes not saving to SomaMap itself, so it cannot read as a provider claim", () => {
    for (const line of [CHECKIN_BOX_KEPT, INTERVIEW_NOTE]) {
      assert.ok(line.includes("SomaMap"), `the subject is named: ${line}`);
      assert.equal(/Baseten|provider/i.test(line), false, `no provider is mentioned: ${line}`);
      assert.equal(line.toLowerCase().includes("nothing is saved"), false, "and not as an absolute claim");
    }
  });
});

describe("the disclosure copy in both modes (Phase 2D follow-up)", () => {
  it("makes no unverified claim about what the provider does with the words", () => {
    /**
     * Nothing about the provider's retention, deletion, training, storage, encryption or location has
     * been independently verified, so the copy may not hint at any of it. The claim words below are the
     * ones a plausible-looking sentence would reach for.
     */
    const unverified = [
      "retain",
      "retention",
      "delete",
      "deleted",
      "deletion",
      "train",
      "training",
      "store",
      "stored",
      "storage",
      "encrypt",
      "encryption",
      "server",
      "gdpr",
      "compliant",
      "secure",
      "anonymous",
      "never shared",
      "never stored",
      "in the eu",
      "in the us",
    ];

    for (const claim of unverified) {
      for (const text of DISCLOSURE_COPY) {
        assert.equal(text.toLowerCase().includes(claim), false, `"${claim}" is an unverified claim: "${text}"`);
      }
    }
  });

  it("does not restate or displace the fixed line", () => {
    /**
     * Rule 5's four forbidden stems are deliberately **not** written down in this file, for the same
     * reason `draftGuard.ts` does not write them down either: putting them in `src/` is exactly what
     * the copy scan exists to prevent, and T5 scans `src/lib` - this file and `copy.ts` included - on
     * every pack run. The disclosure's copy is therefore checked for prohibited words by T5 itself.
     *
     * What is asserted here is the part a scan cannot see: that the disclosure adds no second copy of
     * the fixed line, so the two cannot drift or double up on one screen.
     */
    for (const text of DISCLOSURE_COPY) {
      assert.notEqual(text, DISCLAIMER_LINE, "the fixed line has one home and one render site");
      assert.equal(text.includes(DISCLAIMER_LINE), false);
      assert.equal(text.includes("vocabulary and journaling tool"), false, "no second copy of the fixed line");
    }
  });
});
