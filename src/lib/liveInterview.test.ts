import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BASETEN_SYSTEM_INSTRUCTION, type BasetenTransport } from "./baseten.ts";
import { EXTERNAL_PROVIDER_ID } from "./externalProcessing.ts";
import { interviewStep } from "./interview.ts";
import { adapterFor, type ViolationRecord } from "./models.ts";

/**
 * The live path, end to end, against a stubbed provider (`ISS-18`).
 *
 * What this covers that the existing suites do not: the **contents** of a live-worded card. The other
 * live tests prove the plumbing - one request, the right endpoint, fail-closed when the provider cannot
 * answer - and the red team proves the guard against injected adapters. Neither drives a *provider
 * response* through the whole chain and then reads the card the person would see. That is what these
 * tests do, and it is where the product's central promise either holds or does not: the AI helps word the
 * card, and every field it may not own is still the session's own.
 *
 * No network: the transport is a stub, the credential is a placeholder, and the provider's reply is
 * synthetic. Nothing here is a live provider request, and nothing here claims to be.
 */

const ENV = { BASETEN_API_KEY: "placeholder-not-a-real-credential" };
const REGION = "chest";
const DESCRIPTION = "a band across my chest";

/** The three answers the recorded sequence asks for: spot/spread, material, then the comparison. */
const ANSWERS = [
  { questionId: "Q1", text: "it stays in one spot" },
  { questionId: "Q4", text: "tight, and a bit heavy" },
  { questionId: "Q14", text: "like a band pulled too tight" },
];

/** A provider reply carrying one draft, recording what was actually sent. */
function providerReturning(draft: unknown) {
  const requests: { url: string; body: string }[] = [];

  const transport: BasetenTransport = async (url, init) => {
    requests.push({ url, body: init.body });

    return {
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft) } }] }),
    };
  };

  return { requests, transport };
}

/** One completed live turn, with the draft the provider returned. */
async function completeTurn(draft: unknown, logger: (record: ViolationRecord) => void = () => {}) {
  const { requests, transport } = providerReturning(draft);
  const adapter = adapterFor("live", ENV, transport);

  const result = await interviewStep(
    {
      answers: ANSWERS,
      text: null,
      regionLabel: REGION,
      description: DESCRIPTION,
      acknowledgedProvider: EXTERNAL_PROVIDER_ID,
    },
    { adapter, logger, mode: "live" },
  );

  return { requests, result };
}

/** A draft that should survive the schema, the guard and the grounding. */
const VALID_DRAFT = {
  location_label: "shoulder",
  quality_words: ["tight", "heavy"],
  intensity_metaphor: "like a band pulled too tight",
  duration: "since this morning",
  user_own_sentence: "It is tight and heavy.",
};

describe("a live provider response that is a valid card", () => {
  it("reaches the screen, worded, with no fallback", async () => {
    const { result } = await completeTurn(VALID_DRAFT);

    assert.equal(result.status, "complete");
    assert.equal(result.status === "complete" ? result.usedFallback : true, false);
  });

  it("keeps every field the model may not own as the session's own", async () => {
    const { result } = await completeTurn(VALID_DRAFT);

    assert.equal(result.status, "complete");
    if (result.status !== "complete") return;

    const card = result.card;

    // The region is the fixed map's label the person chose, never the one the model named.
    assert.equal(card.location_label, REGION);
    assert.notEqual(card.location_label, VALID_DRAFT.location_label);

    // The sentence is one the person wrote, never the one the model invented.
    const sessionText = [DESCRIPTION, ...ANSWERS.map((answer) => answer.text)].join(" | ");
    assert.notEqual(card.user_own_sentence, VALID_DRAFT.user_own_sentence);
    assert.ok(sessionText.includes(card.user_own_sentence), card.user_own_sentence);

    // The duration is theirs or empty, never a phrase the model worked out.
    assert.notEqual(card.duration, VALID_DRAFT.duration);
    assert.ok(card.duration === "" || sessionText.includes(card.duration), card.duration);
  });

  it("keeps the words to five at most, and only words the person used", async () => {
    const { result } = await completeTurn(VALID_DRAFT);

    assert.equal(result.status, "complete");
    if (result.status !== "complete") return;

    const sessionText = [DESCRIPTION, ...ANSWERS.map((answer) => answer.text)].join(" ").toLowerCase();

    assert.ok(result.card.quality_words.length <= 5);
    for (const word of result.card.quality_words) {
      assert.ok(sessionText.includes(word.toLowerCase()), `${word} is not a word the person used`);
    }
  });
});

describe("a live provider response that breaks a rule", () => {
  it("refuses a sixth key whole, and names it without its value", async () => {
    const records: ViolationRecord[] = [];
    const { result } = await completeTurn({ ...VALID_DRAFT, recommendation: "rest and drink water" }, (record) =>
      records.push(record),
    );

    assert.equal(result.status, "complete");
    assert.equal(result.status === "complete" ? result.usedFallback : false, true);
    assert.equal(records.length, 1);
    assert.equal(records[0].reason, "unrecognized_keys");
    assert.deepEqual(records[0].keys, ["recommendation"]);
    assert.equal(JSON.stringify(records[0]).includes("rest and drink water"), false);
  });

  it("refuses more than five quality words", async () => {
    const records: ViolationRecord[] = [];
    const { result } = await completeTurn(
      { ...VALID_DRAFT, quality_words: ["tight", "heavy", "warm", "sharp", "dull", "aching"] },
      (record) => records.push(record),
    );

    assert.equal(result.status === "complete" ? result.usedFallback : false, true);
    assert.equal(records[0].reason, "shape");
  });

  it("refuses an instruction the model wrote into a field it may word", async () => {
    const records: ViolationRecord[] = [];
    const { result } = await completeTurn(
      { ...VALID_DRAFT, intensity_metaphor: "you should rest it for a day" },
      (record) => records.push(record),
    );

    assert.equal(result.status === "complete" ? result.usedFallback : false, true);
    assert.equal(records[0].reason, "prohibited-language");
  });

  it("refuses a causal claim about what the sensation means", async () => {
    const records: ViolationRecord[] = [];
    const { result } = await completeTurn(
      { ...VALID_DRAFT, intensity_metaphor: "it suggests a heart problem" },
      (record) => records.push(record),
    );

    assert.equal(result.status === "complete" ? result.usedFallback : false, true);
    assert.equal(records[0].reason, "prohibited-language");
    assert.equal(JSON.stringify(records[0]).includes("heart"), false);
  });

  it("refuses a draft that is not a card at all, and still completes the turn", async () => {
    // No card fields at all: a shape problem, and the turn still completes with the reviewed fallback.
    const empty: ViolationRecord[] = [];
    const missing = await completeTurn({}, (record) => empty.push(record));

    assert.equal(missing.result.status, "complete");
    assert.equal(missing.result.status === "complete" ? missing.result.usedFallback : false, true);
    assert.equal(empty[0].reason, "shape");

    // A draft that is nothing but an extra key is refused as an unrecognised key, and the key is named
    // without its value - so the record is content-free in both directions.
    const extra: ViolationRecord[] = [];
    const hostile = await completeTurn({ meaning: "something is wrong" }, (record) => extra.push(record));

    assert.equal(hostile.result.status === "complete" ? hostile.result.usedFallback : false, true);
    assert.equal(extra[0].reason, "unrecognized_keys");
    assert.deepEqual(extra[0].keys, ["meaning"]);
    assert.equal(JSON.stringify(extra[0]).includes("something is wrong"), false);
  });
});

describe("what the live request carries", () => {
  it("sends the instruction and the person's own material, and nothing else", async () => {
    const { requests } = await completeTurn(VALID_DRAFT);

    assert.equal(requests.length, 1, "one turn, one request");
    assert.equal(requests[0].url, "https://inference.baseten.co/v1/chat/completions");

    const body = JSON.parse(requests[0].body) as {
      model: string;
      messages: readonly { role: string; content: string }[];
      temperature: number;
    };

    assert.deepEqual(Object.keys(body).sort(), ["messages", "model", "temperature"]);
    assert.equal(body.temperature, 0, "a copying task, not a creative one");
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.messages[0].content, BASETEN_SYSTEM_INSTRUCTION);

    const payload = JSON.parse(body.messages[1].content) as unknown;

    assert.deepEqual(payload, { region: REGION, description: DESCRIPTION, answers: ANSWERS });
  });

  it("never puts the acknowledgement into the content it sends", async () => {
    const { requests } = await completeTurn(VALID_DRAFT);
    const body = JSON.parse(requests[0].body) as { messages: readonly { content: string }[] };

    assert.equal(
      body.messages[1].content.includes(EXTERNAL_PROVIDER_ID),
      false,
      "the acknowledgement authorises the request; it is not content",
    );
  });

  it("never sends crisis language to the provider", async () => {
    const { requests, transport } = providerReturning(VALID_DRAFT);
    const adapter = adapterFor("live", ENV, transport);

    const result = await interviewStep(
      { answers: [], text: "I want to hurt myself", acknowledgedProvider: EXTERNAL_PROVIDER_ID },
      { adapter, logger: () => {}, mode: "live" },
    );

    assert.deepEqual(result, { status: "crisis" });
    assert.deepEqual(requests, [], "the shield stops the loop before any request is made");
  });
});

describe("a provider that cannot answer", () => {
  it("times out into the reviewed fallback, with one content-free record", async () => {
    const records: ViolationRecord[] = [];
    const transport: BasetenTransport = async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";

      throw error;
    };
    const adapter = adapterFor("live", ENV, transport);

    const result = await interviewStep(
      {
        answers: ANSWERS,
        text: null,
        regionLabel: REGION,
        acknowledgedProvider: EXTERNAL_PROVIDER_ID,
      },
      { adapter, logger: (record) => records.push(record), mode: "live" },
    );

    assert.equal(result.status, "complete");
    assert.equal(result.status === "complete" ? result.usedFallback : false, true);
    assert.equal(records.length, 1);
    assert.equal(records[0].reason, "provider-unavailable");
    assert.equal(JSON.stringify(records[0]).includes("tight"), false);
  });
});
