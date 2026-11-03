import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type BasetenTransport, type BasetenTransportResponse } from "./baseten.ts";
import { adapterFor, wordCard, type ViolationRecord } from "./models.ts";

/**
 * What the boundary records when a provider turn produces nothing (`ISS-19`).
 *
 * The one approved live request ended as `provider-unavailable` with no way to tell which of two very
 * different things had happened: the provider was never asked (no usable configuration), or it was asked
 * and refused, or replied in a shape this build does not accept. These tests pin the category - and, for
 * an answered request, the numeric status - into the same content-free record, and pin the other half of
 * the requirement: the record still carries no key, no header, no URL, no provider text and no word the
 * person wrote.
 *
 * Every case uses the injected transport. No network, and no live request.
 */

const KEY = "placeholder-not-a-real-credential";
const ENV = { BASETEN_API_KEY: KEY };

const SNAPSHOT = {
  regionLabel: "chest",
  description: "A band across my chest",
  answers: [{ questionId: "Q1", text: "It stays in one spot" }],
};

/** A transport that answers with one status and one body. */
function replying(status: number, body: string): BasetenTransport {
  return async (): Promise<BasetenTransportResponse> => ({ status, text: async () => body });
}

/** A chat-completions envelope carrying one piece of content. */
function chatBody(content: string): string {
  return JSON.stringify({ choices: [{ message: { content } }] });
}

/** A transport that throws one named error. */
function throwing(name: string, message: string): BasetenTransport {
  return async () => {
    const error = new Error(message);
    error.name = name;

    throw error;
  };
}

/** One failed turn against a stubbed transport: the single record, and the fallback that rendered. */
async function failureFor(transport: BasetenTransport, env: Record<string, string | undefined> = ENV) {
  const records: ViolationRecord[] = [];
  const worded = await wordCard(SNAPSHOT, {
    adapter: adapterFor("live", env, transport),
    logger: (record) => records.push(record),
    mode: "live",
  });

  assert.equal(records.length, 1, "a failed provider turn writes exactly one record");
  assert.equal(worded.usedFallback, true, "the reviewed fallback is preserved");
  assert.equal(worded.card.location_label, "chest", "the fallback keeps the session's own region");

  // The fallback never invents a sentence: it carries one the person actually gave, whether that is the
  // description they wrote on the check-in screen or an answer they typed.
  assert.ok(
    [SNAPSHOT.description, ...SNAPSHOT.answers.map((answer) => answer.text)].includes(worded.card.user_own_sentence),
    worded.card.user_own_sentence,
  );

  return records[0];
}

describe("the failure category a provider turn records", () => {
  it("names a timeout", async () => {
    const record = await failureFor(throwing("TimeoutError", "the operation was aborted"));

    assert.deepEqual(record.failure, { code: "timeout" });
  });

  it("names an unreachable provider", async () => {
    const record = await failureFor(throwing("TypeError", "fetch failed"));

    assert.deepEqual(record.failure, { code: "unreachable" });
  });

  it("names an http failure, with the numeric status and nothing else", async () => {
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      const record = await failureFor(replying(status, "your account is suspended, trace 1234"));

      assert.deepEqual(record.failure, { code: "http", status }, `status ${status}`);
    }
  });

  it("names a malformed envelope", async () => {
    const record = await failureFor(replying(200, "not json"));

    assert.deepEqual(record.failure, { code: "malformed" });
  });

  it("names a malformed reply inside a well-formed envelope", async () => {
    // The fenced and prose shapes: content that is not a JSON object, recorded as malformed rather than
    // repaired. This is the case the next live attempt must be able to tell apart from an http failure.
    for (const content of ['```json\n{"location_label":"chest"}\n```', "Here is your card: {...}", "[]"]) {
      const record = await failureFor(replying(200, chatBody(content)));

      assert.deepEqual(record.failure, { code: "malformed" }, content);
    }
  });

  it("names an unusable envelope", async () => {
    for (const body of ["{}", '{"choices":[]}', '{"choices":[{"message":null}]}']) {
      const record = await failureFor(replying(200, body));

      assert.deepEqual(record.failure, { code: "unusable" }, body);
    }
  });

  it("says so plainly when no provider configuration resolved, and asks nobody", async () => {
    const neverCalled: BasetenTransport = async () => {
      throw new Error("the transport must not be reached without a usable configuration");
    };
    const record = await failureFor(neverCalled, {});

    assert.deepEqual(record.failure, { code: "not-configured" });
  });
});

describe("what the record may and may not contain", () => {
  it("carries no key, no user text, no URL and no provider body", async () => {
    const providerText = "your account is suspended, trace 1234";
    const serialised = JSON.stringify(await failureFor(replying(500, providerText)));

    for (const forbidden of [
      KEY,
      "A band across my chest",
      "It stays in one spot",
      "inference.baseten.co",
      "/chat/completions",
      providerText,
      "suspended",
      "1234",
      "choices",
      "authorization",
      "Bearer",
    ]) {
      assert.equal(serialised.includes(forbidden), false, `${forbidden} must not be recorded`);
    }
  });

  it("carries the categories and the question ids, and nothing else", async () => {
    const record = await failureFor(replying(401, "nope"));

    assert.deepEqual(Object.keys(record).sort(), ["event", "failure", "keys", "mode", "questions", "reason"]);
    assert.equal(record.reason, "provider-unavailable");
    assert.equal(record.mode, "live");
    assert.deepEqual(record.keys, []);
    assert.deepEqual(record.questions, ["Q1"]);
  });

  it("carries no failure detail for a turn that did not fail", async () => {
    const records: ViolationRecord[] = [];
    const draft = {
      location_label: "chest",
      quality_words: [],
      intensity_metaphor: "",
      duration: "",
      user_own_sentence: "It stays in one spot",
    };
    const worded = await wordCard(SNAPSHOT, {
      adapter: adapterFor("live", ENV, replying(200, chatBody(JSON.stringify(draft)))),
      logger: (record) => records.push(record),
      mode: "live",
    });

    assert.equal(worded.usedFallback, false, "a valid reply still words the card");
    assert.deepEqual(records, [], "nothing is recorded for a turn that succeeded");
  });
});
