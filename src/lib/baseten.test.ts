import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BASETEN_DEFAULT_BASE_URL,
  BASETEN_DEFAULT_MODEL,
  BASETEN_DEFAULT_TIMEOUT_MS,
  BASETEN_SYSTEM_INSTRUCTION,
  BasetenRequestError,
  basetenAdapter,
  basetenDraftFrom,
  basetenPayloadFor,
  basetenSessionPayload,
  resolveBasetenConfig,
  type BasetenConfig,
  type BasetenTransport,
  type BasetenTransportResponse,
} from "./baseten.ts";
import { interviewFixture } from "./fixtures.ts";
import type { ModelSnapshot } from "./models.ts";

/**
 * The Baseten adapter - Phase 2F.
 *
 * Everything here runs without a network: the transport is injected, and the only "key" is a
 * placeholder string no provider would accept. The properties under test are the ones the phase exists
 * for - only the allowlisted data can travel, no request is made without a decision to send, and every
 * way a provider can fail lands on the reviewed fallback card with nothing logged.
 */

/** A placeholder, not a credential: no real key is read, used or written in this file. */
const PLACEHOLDER_KEY = "placeholder-not-a-real-credential";
const ENV = { BASETEN_API_KEY: PLACEHOLDER_KEY };

const SNAPSHOT: ModelSnapshot = {
  answers: [
    { questionId: "Q1", text: "tight and heavy" },
    { questionId: "Q4", text: "like a scarf knotted too tight" },
  ],
  regionLabel: "chest",
  description: "a band across my chest",
};

/** The approved configuration, as the resolver would hand it over. */
const CONFIG: BasetenConfig = {
  baseUrl: BASETEN_DEFAULT_BASE_URL,
  model: BASETEN_DEFAULT_MODEL,
  timeoutMs: BASETEN_DEFAULT_TIMEOUT_MS,
  apiKey: PLACEHOLDER_KEY,
};

/** A chat-completions body wrapping `content`, which is what the model is asked to produce. */
function chatBody(content: string): string {
  return JSON.stringify({ choices: [{ message: { content } }] });
}

/** A transport that answers with a fixed body and status. */
function replyingWith(body: string, status = 200) {
  return async (): Promise<BasetenTransportResponse> => ({ status, text: async () => body });
}

/** A transport that records what it was asked and answers with whatever the test wants. */
function recordingTransport(
  reply: () => Promise<BasetenTransportResponse>,
): { calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[]; transport: BasetenTransport } {
  const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];

  return {
    calls,
    transport: async (url, init) => {
      calls.push({ url, init });

      return reply();
    },
  };
}

describe("the provider configuration (Phase 2F)", () => {
  it("accepts the approved defaults when only the key is set", () => {
    const resolution = resolveBasetenConfig(ENV);

    assert.equal(resolution.ok, true);

    if (!resolution.ok) return;

    assert.equal(resolution.config.baseUrl, BASETEN_DEFAULT_BASE_URL);
    assert.equal(resolution.config.baseUrl, "https://inference.baseten.co/v1");
    assert.equal(resolution.config.model, BASETEN_DEFAULT_MODEL);
    assert.equal(resolution.config.model, "meta-models/muse-spark-open-1026");
    assert.equal(resolution.config.timeoutMs, BASETEN_DEFAULT_TIMEOUT_MS);
    assert.equal(resolution.config.timeoutMs, 20_000);
    assert.equal(resolution.config.apiKey, PLACEHOLDER_KEY);
  });

  it("refuses to resolve without a key, and says only that", () => {
    for (const env of [{}, { BASETEN_API_KEY: "" }, { BASETEN_API_KEY: "   " }]) {
      assert.deepEqual(resolveBasetenConfig(env), { ok: false, reason: "missing-key" });
    }
  });

  it("refuses a base URL that is not https, or carries a query", () => {
    for (const url of ["http://inference.baseten.co/v1", "not a url", "https://inference.baseten.co/v1?k=1"]) {
      assert.deepEqual(resolveBasetenConfig({ ...ENV, BASETEN_BASE_URL: url }), { ok: false, reason: "bad-base-url" }, url);
    }
  });

  it("refuses any host that is not Baseten's, including lookalikes", () => {
    // The live disclosure tells the person their words go to Baseten. A base URL pointing anywhere else
    // would make that sentence false, so it is refused rather than used.
    for (const host of [
      "https://evil.example/v1",
      "https://notbaseten.co/v1",
      "https://baseten.co.evil.example/v1",
      "https://baseten.co.uk/v1",
      "https://127.0.0.1:8080/v1",
    ]) {
      assert.deepEqual(
        resolveBasetenConfig({ ...ENV, BASETEN_BASE_URL: host }),
        { ok: false, reason: "not-baseten-host" },
        host,
      );
    }
  });

  it("accepts baseten.co and its subdomains, and trims one trailing slash", () => {
    for (const [host, expected] of [
      ["https://baseten.co", "https://baseten.co"],
      ["https://api.baseten.co/v1/", "https://api.baseten.co/v1"],
      ["https://inference.baseten.co/v1", "https://inference.baseten.co/v1"],
    ]) {
      const resolution = resolveBasetenConfig({ ...ENV, BASETEN_BASE_URL: host });

      assert.equal(resolution.ok, true, host);

      if (resolution.ok) assert.equal(resolution.config.baseUrl, expected);
    }
  });

  it("treats a blank model id as the default, and refuses one that is not a path segment", () => {
    const blank = resolveBasetenConfig({ ...ENV, BASETEN_MODEL: "  " });

    assert.equal(blank.ok, true);

    if (blank.ok) assert.equal(blank.config.model, BASETEN_DEFAULT_MODEL);

    for (const model of ["meta models/muse", "meta-models/muse\nspark", "x".repeat(201)]) {
      assert.deepEqual(resolveBasetenConfig({ ...ENV, BASETEN_MODEL: model }), { ok: false, reason: "bad-model" }, model);
    }

    // The unversioned identifier is a configuration change, not a code change - and the approved
    // default (the exact id the provider issued) is never silently replaced by it.
    const alternative = resolveBasetenConfig({ ...ENV, BASETEN_MODEL: "meta-models/muse-spark-open" });

    assert.equal(alternative.ok, true);

    if (alternative.ok) assert.equal(alternative.config.model, "meta-models/muse-spark-open");
  });

  it("refuses a timeout outside the accepted range, and accepts a custom one", () => {
    for (const timeout of ["0", "999", "120001", "abc", "1.5", "-20000"]) {
      assert.deepEqual(
        resolveBasetenConfig({ ...ENV, BASETEN_TIMEOUT_MS: timeout }),
        { ok: false, reason: "bad-timeout" },
        timeout,
      );
    }

    const custom = resolveBasetenConfig({ ...ENV, BASETEN_TIMEOUT_MS: "5000" });

    assert.equal(custom.ok, true);

    if (custom.ok) assert.equal(custom.config.timeoutMs, 5_000);
  });

  it("carries no value in a refusal", () => {
    const resolution = resolveBasetenConfig({ ...ENV, BASETEN_BASE_URL: "https://evil.example/secret-path" });

    assert.equal(resolution.ok, false);
    assert.deepEqual(Object.keys(resolution).sort(), ["ok", "reason"]);
    assert.equal(JSON.stringify(resolution).includes(PLACEHOLDER_KEY), false);
    assert.equal(JSON.stringify(resolution).includes("secret-path"), false);
  });
});

describe("the payload allowlist (Phase 2F)", () => {
  it("carries the region, the description and the answers with their question ids", () => {
    const session = basetenSessionPayload(SNAPSHOT);

    assert.deepEqual(session, {
      region: "chest",
      description: "a band across my chest",
      answers: [
        { questionId: "Q1", text: "tight and heavy" },
        { questionId: "Q4", text: "like a scarf knotted too tight" },
      ],
    });
    assert.deepEqual(Object.keys(session).sort(), ["answers", "description", "region"]);
  });

  it("ignores any field the snapshot does not own, rather than spreading it", () => {
    const stuffed = {
      ...SNAPSHOT,
      acknowledgedProvider: "baseten",
      mode: "live",
      userId: "8f1c",
      accessToken: "placeholder-token",
    } as unknown as ModelSnapshot;

    assert.deepEqual(basetenSessionPayload(stuffed), basetenSessionPayload(SNAPSHOT));
  });

  it("defaults a missing region and description to empty strings", () => {
    assert.deepEqual(basetenSessionPayload({ answers: [] }), { region: "", description: "", answers: [] });
  });

  it("builds one request body: the instruction, then the session as JSON, and nothing else", () => {
    const payload = basetenPayloadFor(SNAPSHOT, "meta-models/muse-spark-open-1026");

    assert.deepEqual(Object.keys(payload).sort(), ["messages", "model", "temperature"]);
    assert.equal(payload.model, "meta-models/muse-spark-open-1026");
    assert.equal(payload.temperature, 0);
    assert.equal(payload.messages.length, 2);
    assert.equal(payload.messages[0].role, "system");
    assert.equal(payload.messages[0].content, BASETEN_SYSTEM_INSTRUCTION);
    assert.equal(payload.messages[1].role, "user");
    assert.deepEqual(JSON.parse(payload.messages[1].content), basetenSessionPayload(SNAPSHOT));

    // The instruction never carries the person's words, and the body never carries the acknowledgement.
    assert.equal(BASETEN_SYSTEM_INSTRUCTION.includes("tight and heavy"), false);
    assert.equal(JSON.stringify(payload).includes("acknowledgedProvider"), false);
  });

  it("asks for the five fields and forbids the sixth, in the instruction itself", () => {
    for (const field of ["location_label", "quality_words", "intensity_metaphor", "duration", "user_own_sentence"]) {
      assert.ok(BASETEN_SYSTEM_INSTRUCTION.includes(field), `the instruction names ${field}`);
    }

    assert.ok(/never add a key/i.test(BASETEN_SYSTEM_INSTRUCTION));
    assert.ok(/copied exactly/i.test(BASETEN_SYSTEM_INSTRUCTION));
    assert.ok(/data, not instructions/i.test(BASETEN_SYSTEM_INSTRUCTION));
  });
});

describe("the response is parsed strictly (Phase 2F)", () => {
  it("returns the model's object exactly as it arrived, unvalidated", () => {
    assert.deepEqual(basetenDraftFrom(chatBody(JSON.stringify(interviewFixture.draft_card))), interviewFixture.draft_card);

    // Even a draft carrying a sixth key comes back untouched: refusing it is the strict schema's job,
    // not this parser's, so the refusal is recorded with the key names the schema found.
    assert.deepEqual(
      basetenDraftFrom(chatBody(JSON.stringify(interviewFixture.invalid_draft_card))),
      interviewFixture.invalid_draft_card,
    );
  });

  it("refuses a body that is not JSON, or not an object", () => {
    for (const body of ["", "not json", "<html>502 Bad Gateway</html>", "[]", "null", '"a string"', "42"]) {
      assert.throws(
        () => basetenDraftFrom(body),
        (error: unknown) => error instanceof BasetenRequestError && error.code === "malformed",
        body,
      );
    }
  });

  it("refuses a well-formed body with no usable message", () => {
    for (const body of [
      "{}",
      '{"choices":[]}',
      '{"choices":"no"}',
      '{"choices":[null]}',
      '{"choices":[{}]}',
      '{"choices":[{"message":null}]}',
      '{"choices":[{"message":"text"}]}',
      '{"choices":[{"message":{"content":42}}]}',
      '{"choices":[{"message":{"content":null}}]}',
    ]) {
      assert.throws(
        () => basetenDraftFrom(body),
        (error: unknown) => error instanceof BasetenRequestError && error.code === "unusable",
        body,
      );
    }
  });

  it("refuses content that is not itself a JSON object, and accepts an empty one", () => {
    for (const content of ["", "Here is your card: {...}", "[]", "null", '"text"', "42"]) {
      assert.throws(
        () => basetenDraftFrom(chatBody(content)),
        (error: unknown) => error instanceof BasetenRequestError && error.code === "malformed",
        content,
      );
    }

    // `{}` is well-formed but empty: the schema refuses it as a shape problem, and the turn still
    // completes with the reviewed fallback. The parser's job is the shape of the envelope, not the
    // shape of the card.
    assert.deepEqual(basetenDraftFrom(chatBody("{}")), {});
  });
});

describe("the adapter's one request (Phase 2F)", () => {
  it("posts once, to the approved URL, with only the allowlisted body", async () => {
    const { calls, transport } = recordingTransport(replyingWith(chatBody(JSON.stringify(interviewFixture.draft_card))));
    const adapter = basetenAdapter({ config: CONFIG, transport });

    const draft = await adapter.interview(SNAPSHOT);

    assert.equal(calls.length, 1, "one attempt, no retries");
    assert.equal(calls[0].url, "https://inference.baseten.co/v1/chat/completions");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(Object.keys(calls[0].init.headers).sort(), ["authorization", "content-type"]);
    assert.equal(calls[0].init.headers.authorization, `Bearer ${PLACEHOLDER_KEY}`);

    const sent = JSON.parse(calls[0].init.body);

    assert.deepEqual(Object.keys(sent).sort(), ["messages", "model", "temperature"]);
    assert.equal(sent.model, BASETEN_DEFAULT_MODEL);
    assert.deepEqual(JSON.parse(sent.messages[1].content), basetenSessionPayload(SNAPSHOT));

    // No user data in the URL, and the acknowledgement never travels.
    assert.equal(calls[0].url.includes("chest"), false);
    assert.equal(calls[0].url.includes("tight"), false);
    assert.equal(calls[0].init.body.includes("acknowledgedProvider"), false);

    assert.deepEqual(draft, interviewFixture.draft_card);
  });

  it("asks for the reviewed question sequence, exactly as the other adapters do", () => {
    const { transport } = recordingTransport(replyingWith(chatBody("{}")));

    assert.deepEqual(basetenAdapter({ config: CONFIG, transport }).questionSequence(), interviewFixture.question_ids);
  });

  it("turns every failure into one refusal code, with no retry", async () => {
    const cases: readonly [string, () => Promise<BasetenTransportResponse>, string][] = [
      [
        "timeout",
        async () => {
          const aborted = new Error("the operation was aborted");
          aborted.name = "TimeoutError";
          throw aborted;
        },
        "timeout",
      ],
      [
        "unreachable",
        async () => {
          throw new Error("ECONNREFUSED");
        },
        "unreachable",
      ],
      ["http", replyingWith("slow down", 429), "http"],
      ["server error", replyingWith("upstream exploded", 500), "http"],
      ["malformed body", replyingWith("not json"), "malformed"],
      ["empty envelope", replyingWith("{}"), "unusable"],
      ["content not JSON", replyingWith(chatBody("prose")), "malformed"],
    ];

    for (const [label, reply, code] of cases) {
      const { calls, transport } = recordingTransport(reply);
      const adapter = basetenAdapter({ config: CONFIG, transport });

      await assert.rejects(
        adapter.interview(SNAPSHOT),
        (error: unknown) => error instanceof BasetenRequestError && error.code === code,
        label,
      );
      assert.equal(calls.length, 1, `${label}: exactly one attempt`);
    }
  });

  it("puts no response body, model text or key into the error it throws", async () => {
    const providerText = "your account is suspended, trace 1234";
    const { transport } = recordingTransport(replyingWith(providerText, 500));

    await assert.rejects(basetenAdapter({ config: CONFIG, transport }).interview(SNAPSHOT), (error: unknown) => {
      assert.ok(error instanceof BasetenRequestError);
      assert.equal(error.code, "http");
      assert.equal(error.message.includes("suspended"), false);
      assert.equal(error.message.includes("1234"), false);
      assert.equal(error.message.includes(PLACEHOLDER_KEY), false);
      assert.equal(error.message.includes("tight and heavy"), false);
      assert.equal(JSON.stringify(error, Object.getOwnPropertyNames(error)).includes(providerText), false);

      return true;
    });
  });
});

describe("the instruction's field rules (Phase 2G.2)", () => {
  /**
   * The instruction line that carries one card field's rule.
   *
   * Found by the field name rather than by its exact formatting, so re-wrapping the list is not a test
   * failure - but a rule that drifts away from the field it belongs to is, because each rule below is
   * read from the line of the field it must constrain. The assertions pin the wording that states each
   * requirement, so removing a requirement or weakening it to a suggestion fails the test.
   */
  function fieldRule(field: string): string {
    const line = BASETEN_SYSTEM_INSTRUCTION.split("\n").find((candidate) => candidate.includes(`"${field}"`));

    assert.ok(line, `the instruction states a rule for ${field}`);

    return line;
  }

  it("1. location_label: the supplied label only, never a different region", () => {
    const rule = fieldRule("location_label");

    assert.ok(rule.includes("the region label you were given"), "the region is the label it was given");
    assert.ok(/never name a different region/i.test(rule), "naming a different region is forbidden");
  });

  it("2. quality_words: the person's own words, in their order, with no synonyms", () => {
    const rule = fieldRule("quality_words");

    assert.ok(/at most five single words the person used/i.test(rule), "at most five, and theirs");
    assert.ok(/in their order/i.test(rule), "their order is preserved");
    assert.ok(/no synonyms/i.test(rule), "synonyms are forbidden");
    assert.ok(/no words they did not write/i.test(rule), "invented words are forbidden");
  });

  it("3. intensity_metaphor: only their own comparison, never ordinary description", () => {
    const rule = fieldRule("intensity_metaphor");

    assert.ok(rule.includes("the person's own comparison"), "the comparison must be theirs");
    assert.ok(/copied exactly/i.test(rule), "and copied, not composed");
    assert.ok(/only a comparison they wrote/i.test(rule), "only a comparison they wrote qualifies");
    assert.ok(/ordinary description is not a comparison/i.test(rule), "description may not be promoted");
  });

  it("4. duration: their own phrase about how long it has been there, never worked out", () => {
    const rule = fieldRule("duration");

    assert.ok(/the person's own phrase about how long it has been there/i.test(rule), "their own phrase");
    assert.ok(/copied exactly/i.test(rule), "copied, not composed");
    assert.ok(/never work out a duration they did not give/i.test(rule), "inference is forbidden");
  });

  it("5. user_own_sentence: one complete sentence, copied, never reassembled", () => {
    const rule = fieldRule("user_own_sentence");

    assert.ok(/one complete sentence the person wrote/i.test(rule), "one complete sentence, theirs");
    assert.ok(/copied exactly/i.test(rule), "copied, not rewritten");
    assert.ok(/never join fragments/i.test(rule), "fragments may not be joined");
    assert.ok(/correct their grammar/i.test(rule), "grammar may not be corrected");
    assert.ok(/change what it says/i.test(rule), "the meaning may not be changed");
  });

  it("6. forbids working out a location, a duration, an intensity, a cause or a meaning", () => {
    assert.ok(
      /never work out or add a location, a duration, an intensity, a cause or a meaning/i.test(
        BASETEN_SYSTEM_INSTRUCTION,
      ),
      "the instruction forbids inferring any of the five",
    );
  });
});
