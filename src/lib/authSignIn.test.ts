import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signInWithPassword } from "./authSignIn.ts";
import type { SupabaseTarget } from "./supabaseTarget.ts";

/**
 * The sign-in call, which had no tests of its own until now - and which is the one call that fails in
 * production, so the categories it returns are what an operator has to work from.
 *
 * `authSession.ts` reads cookies through `next/headers` in its *other* functions, but `signInWithPassword`
 * takes an injected `fetch` and touches none of that, so it is reachable from a test exactly as the sign-up
 * call is.
 */
const CONFIG: SupabaseTarget = {
  mode: "hosted",
  baseUrl: "https://project.supabase.co",
  anonKey: "publishable-placeholder",
};

const EMAIL = "person@example.invalid";
const PASSWORD = "a-placeholder-password";

type Call = { url: string; method: string; headers: Record<string, string>; body: string };

function recordingFetch(status: number, body = "{}"): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: String(init?.method ?? "GET"),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : "",
    });

    return new Response(body, { status });
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

const THROWING = (async () => {
  throw new Error("network");
}) as unknown as typeof fetch;

const TOKEN_BODY = JSON.stringify({ access_token: "token-placeholder", user: { id: "user-id" } });

describe("signing in", () => {
  it("posts the credentials to the password grant, with the publishable key and nothing else", async () => {
    const { calls, fetchImpl } = recordingFetch(200, TOKEN_BODY);
    const result = await signInWithPassword(CONFIG, EMAIL, PASSWORD, fetchImpl);

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://project.supabase.co/auth/v1/token?grant_type=password");
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(Object.keys(calls[0].headers).sort(), ["apikey", "content-type"]);
    assert.equal(calls[0].headers.apikey, CONFIG.anonKey);
    assert.deepEqual(JSON.parse(calls[0].body), { email: EMAIL, password: PASSWORD });

    if (result.ok) assert.equal(result.expiresInSeconds, 3600);
  });

  it("reports a session as a session, and a 200 without one as unavailable", async () => {
    const missingToken = recordingFetch(200, JSON.stringify({ user: { id: "user-id" } }));
    const missingUser = recordingFetch(200, JSON.stringify({ access_token: "token-placeholder" }));

    assert.deepEqual(await signInWithPassword(CONFIG, EMAIL, PASSWORD, missingToken.fetchImpl), {
      ok: false,
      reason: "unavailable",
    });
    assert.deepEqual(await signInWithPassword(CONFIG, EMAIL, PASSWORD, missingUser.fetchImpl), {
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("the categories a failure is reported as", () => {
  it("names a refused key as the deployment's problem, not the person's", async () => {
    const refusedKey = recordingFetch(401, JSON.stringify({ code: 401, error_code: "invalid_api_key" }));

    assert.deepEqual(await signInWithPassword(CONFIG, EMAIL, PASSWORD, refusedKey.fetchImpl), {
      ok: false,
      reason: "invalid-key",
    });
  });

  it("names a rate limit as a rate limit", async () => {
    const limited = recordingFetch(429, JSON.stringify({ error_code: "over_request_rate_limit" }));

    assert.deepEqual(await signInWithPassword(CONFIG, EMAIL, PASSWORD, limited.fetchImpl), {
      ok: false,
      reason: "rate-limited",
    });
  });

  it("keeps every credential-shaped refusal in one undifferentiated answer", async () => {
    // Wrong password, unknown address and unconfirmed address all look the same from outside, which is the
    // property the sign-in screen has always had: nothing here tells a caller whether an address exists.
    for (const body of [
      JSON.stringify({ code: 400, error_code: "invalid_credentials" }),
      JSON.stringify({ code: 400, error_code: "email_not_confirmed" }),
      JSON.stringify({ code: 400, error_code: "user_not_found" }),
      JSON.stringify({ code: 422, error_code: "validation_failed" }),
      "",
    ]) {
      assert.deepEqual(await signInWithPassword(CONFIG, EMAIL, PASSWORD, recordingFetch(400, body).fetchImpl), {
        ok: false,
        reason: "rejected",
      });
    }
  });

  it("calls a broken service unavailable, and an unexpected status a refusal", async () => {
    assert.deepEqual(await signInWithPassword(CONFIG, EMAIL, PASSWORD, recordingFetch(503).fetchImpl), {
      ok: false,
      reason: "unavailable",
    });
    assert.deepEqual(await signInWithPassword(CONFIG, EMAIL, PASSWORD, recordingFetch(500).fetchImpl), {
      ok: false,
      reason: "unavailable",
    });
    assert.deepEqual(await signInWithPassword(CONFIG, EMAIL, PASSWORD, recordingFetch(418).fetchImpl), {
      ok: false,
      reason: "rejected",
    });
  });

  it("survives a body that is not JSON, and a transport failure, without throwing", async () => {
    const html = recordingFetch(401, "<html>gateway</html>");

    assert.deepEqual(await signInWithPassword(CONFIG, EMAIL, PASSWORD, html.fetchImpl), {
      ok: false,
      reason: "rejected",
    });
    assert.deepEqual(await signInWithPassword(CONFIG, EMAIL, PASSWORD, THROWING), {
      ok: false,
      reason: "unavailable",
    });
  });

  it("returns nothing that could leak: no address, no password, no token, no service message", async () => {
    const results = [
      await signInWithPassword(CONFIG, EMAIL, PASSWORD, recordingFetch(200, TOKEN_BODY).fetchImpl),
      await signInWithPassword(CONFIG, EMAIL, PASSWORD, recordingFetch(401, JSON.stringify({ error_code: "invalid_api_key", msg: "Invalid API key" })).fetchImpl),
      await signInWithPassword(CONFIG, EMAIL, PASSWORD, recordingFetch(400, JSON.stringify({ error_code: "invalid_credentials" })).fetchImpl),
      await signInWithPassword(CONFIG, EMAIL, PASSWORD, THROWING),
    ];

    for (const result of results) {
      const text = JSON.stringify(result);

      assert.equal(text.includes(EMAIL), false, text);
      assert.equal(text.includes(PASSWORD), false, text);
      assert.equal(text.includes("Invalid API key"), false, text);
      assert.equal(text.includes(CONFIG.anonKey), false, text);
    }
  });
});
