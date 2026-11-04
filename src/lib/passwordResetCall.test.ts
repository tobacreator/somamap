import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { exchangeRecoveryTokenHash, recoveryTokenIsValid, updatePasswordWithRecoveryToken } from "./passwordResetCall.ts";
import type { SupabaseTarget } from "./supabaseTarget.ts";

/** The target the route would hand this module, with placeholder values that are never real. */
const CONFIG: SupabaseTarget = {
  mode: "hosted",
  baseUrl: "https://project.supabase.co",
  anonKey: "publishable-placeholder",
};

type Call = { url: string; method: string; headers: Record<string, string>; body: string };

/** A fetch that records what it was asked for and answers with one fixed status and body. */
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

describe("verifying a recovery bearer", () => {
  it("asks the account service about the token, with the publishable key and the bearer", async () => {
    const { calls, fetchImpl } = recordingFetch(200, JSON.stringify({ id: "user-id" }));

    assert.equal(await recoveryTokenIsValid(CONFIG, "token-value", fetchImpl), "valid");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://project.supabase.co/auth/v1/user");
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].headers.apikey, CONFIG.anonKey);
    assert.equal(calls[0].headers.authorization, "Bearer token-value");
    // The service key does not exist in this path, and nothing else is sent.
    assert.deepEqual(Object.keys(calls[0].headers).sort(), ["apikey", "authorization"]);
  });

  it("calls a refused token invalid and a busy or broken service unavailable", async () => {
    assert.equal(await recoveryTokenIsValid(CONFIG, "t", recordingFetch(401).fetchImpl), "invalid");
    assert.equal(await recoveryTokenIsValid(CONFIG, "t", recordingFetch(403).fetchImpl), "invalid");
    assert.equal(await recoveryTokenIsValid(CONFIG, "t", recordingFetch(429).fetchImpl), "unavailable");
    assert.equal(await recoveryTokenIsValid(CONFIG, "t", recordingFetch(503).fetchImpl), "unavailable");
  });

  it("calls a transport failure unavailable rather than invalid", async () => {
    const throwing = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;

    assert.equal(await recoveryTokenIsValid(CONFIG, "t", throwing), "unavailable");
  });
});

describe("changing the password", () => {
  it("puts the new password on the account service's own user endpoint, as the bearer's user", async () => {
    const { calls, fetchImpl } = recordingFetch(200, JSON.stringify({ id: "user-id" }));

    assert.deepEqual(await updatePasswordWithRecoveryToken(CONFIG, "token-value", "a new passphrase", fetchImpl), {
      ok: true,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://project.supabase.co/auth/v1/user");
    assert.equal(calls[0].method, "PUT");
    assert.equal(calls[0].headers.authorization, "Bearer token-value");
    // No user id is named anywhere: the account service takes the user from the token.
    assert.deepEqual(JSON.parse(calls[0].body), { password: "a new passphrase" });
    assert.equal(calls[0].body.includes("user-id"), false);
  });

  it("reports a refused password, an invalid token, a busy service and a failure apart", async () => {
    assert.deepEqual(await updatePasswordWithRecoveryToken(CONFIG, "t", "p", recordingFetch(422).fetchImpl), {
      ok: false,
      reason: "weak-password",
    });
    assert.deepEqual(await updatePasswordWithRecoveryToken(CONFIG, "t", "p", recordingFetch(401).fetchImpl), {
      ok: false,
      reason: "invalid-token",
    });
    assert.deepEqual(await updatePasswordWithRecoveryToken(CONFIG, "t", "p", recordingFetch(429).fetchImpl), {
      ok: false,
      reason: "unavailable",
    });
    assert.deepEqual(await updatePasswordWithRecoveryToken(CONFIG, "t", "p", recordingFetch(500).fetchImpl), {
      ok: false,
      reason: "unavailable",
    });
    assert.deepEqual(await updatePasswordWithRecoveryToken(CONFIG, "t", "p", recordingFetch(418).fetchImpl), {
      ok: false,
      reason: "rejected",
    });
  });

  it("calls a transport failure unavailable, and returns nothing that could leak", async () => {
    const throwing = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;

    const result = await updatePasswordWithRecoveryToken(CONFIG, "t", "p", throwing);

    assert.deepEqual(result, { ok: false, reason: "unavailable" });
    assert.equal(JSON.stringify(result).includes("token"), false);
  });
});

describe("exchanging a hashed recovery link", () => {
  it("swaps the hash for a session through the provider's own verify endpoint", async () => {
    const { calls, fetchImpl } = recordingFetch(
      200,
      JSON.stringify({ access_token: "session-token", user: { id: "user-id" } }),
    );

    assert.deepEqual(await exchangeRecoveryTokenHash(CONFIG, "hashed-value", fetchImpl), {
      ok: true,
      token: "session-token",
    });
    assert.equal(calls[0].url, "https://project.supabase.co/auth/v1/verify");
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(JSON.parse(calls[0].body), { type: "recovery", token_hash: "hashed-value" });
  });

  it("reports an expired hash as invalid and a broken service as unavailable", async () => {
    assert.deepEqual(await exchangeRecoveryTokenHash(CONFIG, "h", recordingFetch(403).fetchImpl), {
      ok: false,
      reason: "invalid-token",
    });
    assert.deepEqual(await exchangeRecoveryTokenHash(CONFIG, "h", recordingFetch(503).fetchImpl), {
      ok: false,
      reason: "unavailable",
    });
  });

  it("reports a 200 with no session as unavailable rather than as a success", async () => {
    assert.deepEqual(await exchangeRecoveryTokenHash(CONFIG, "h", recordingFetch(200, JSON.stringify({})).fetchImpl), {
      ok: false,
      reason: "unavailable",
    });
  });
});
