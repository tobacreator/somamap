import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signUpWithPassword } from "./authSignUp.ts";
import type { SupabaseTarget } from "./supabaseTarget.ts";

/**
 * Account creation - the sign-up half of the session, tested without a network.
 *
 * The properties are the ones the screen depends on: the call goes to the account service's own sign-up
 * endpoint with the **publishable key only**, the person's new credentials travel in the body and nowhere
 * else, and the two possible successes are told apart honestly - a session means signed in, no session
 * means this project asks for the address to be confirmed first. A refusal and an unreachable service are
 * different answers, and neither one carries a key, a password or a reason the service did not give.
 */

const CONFIG: SupabaseTarget = {
  mode: "hosted",
  baseUrl: "https://project.example",
  anonKey: "publishable-placeholder",
};

const EMAIL = "someone@example.com";
const PASSWORD = "a-password-typed-once";

/** A `fetch` that records what it was asked and answers with one reply. */
function recordingFetch(status: number, body: string) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];

  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
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

describe("creating an account (sign-up)", () => {
  it("posts the new credentials to the account service's own sign-up endpoint", async () => {
    const { calls, fetchImpl } = recordingFetch(200, JSON.stringify({ access_token: "token-placeholder", user: { id: "user-id" } }));

    const result = await signUpWithPassword(CONFIG, EMAIL, PASSWORD, fetchImpl);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://project.example/auth/v1/signup");
    assert.equal(calls[0].method, "POST");

    // The publishable key travels; nothing else does.
    assert.deepEqual(Object.keys(calls[0].headers).sort(), ["apikey", "content-type"]);
    assert.equal(calls[0].headers.apikey, CONFIG.anonKey);

    const sent = JSON.parse(calls[0].body) as Record<string, unknown>;

    assert.deepEqual(Object.keys(sent).sort(), ["email", "password"]);
    assert.equal(sent.email, EMAIL);
    assert.equal(sent.password, PASSWORD);

    assert.deepEqual(result, { ok: true, session: { userId: "user-id", accessToken: "token-placeholder" }, expiresInSeconds: 3600 });
  });

  it("reports a session as signed in, and its absence as confirmation needed", async () => {
    const withSession = recordingFetch(200, JSON.stringify({ access_token: "token-placeholder", user: { id: "user-id" } }));
    const withoutSession = recordingFetch(200, JSON.stringify({ user: { id: "user-id" }, session: null }));

    const signedIn = await signUpWithPassword(CONFIG, EMAIL, PASSWORD, withSession.fetchImpl);
    const pending = await signUpWithPassword(CONFIG, EMAIL, PASSWORD, withoutSession.fetchImpl);

    assert.equal(signedIn.ok, true);
    assert.notEqual(signedIn.ok ? signedIn.session : null, null);
    assert.equal(pending.ok, true);
    assert.equal(pending.ok ? pending.session : undefined, null);
  });

  it("reports a refusal as rejected, and an unreachable service as unavailable", async () => {
    const refused = recordingFetch(422, JSON.stringify({ msg: "Signups not allowed for this instance" }));
    const broken = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    assert.deepEqual(await signUpWithPassword(CONFIG, EMAIL, PASSWORD, refused.fetchImpl), { ok: false, reason: "rejected" });
    assert.deepEqual(await signUpWithPassword(CONFIG, EMAIL, PASSWORD, broken), { ok: false, reason: "unavailable" });
  });

  it("returns nothing that a caller could leak: no password, no key, no service message", async () => {
    const { fetchImpl } = recordingFetch(200, JSON.stringify({ access_token: "token-placeholder", user: { id: "user-id" } }));

    const result = await signUpWithPassword(CONFIG, EMAIL, PASSWORD, fetchImpl);
    const serialised = JSON.stringify(result);

    assert.equal(serialised.includes(PASSWORD), false);
    assert.equal(serialised.includes(CONFIG.anonKey), false);

    const refused = recordingFetch(422, "Signups not allowed for this instance");
    const refusal = await signUpWithPassword(CONFIG, EMAIL, PASSWORD, refused.fetchImpl);

    assert.equal(JSON.stringify(refusal).includes("Signups not allowed"), false);
  });

  it("treats a 201 as success too, and a body with no user as confirmation needed", async () => {
    const created = recordingFetch(201, JSON.stringify({ access_token: "token-placeholder", user: { id: "user-id" } }));
    const odd = recordingFetch(200, JSON.stringify({}));

    const signedIn = await signUpWithPassword(CONFIG, EMAIL, PASSWORD, created.fetchImpl);

    assert.equal(signedIn.ok, true);
    assert.deepEqual(signedIn.ok ? signedIn.session : null, { userId: "user-id", accessToken: "token-placeholder" });

    const noUser = await signUpWithPassword(CONFIG, EMAIL, PASSWORD, odd.fetchImpl);

    assert.equal(noUser.ok, true);
    assert.equal(noUser.ok ? noUser.session : undefined, null);
  });
});
