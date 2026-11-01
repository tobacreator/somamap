import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { keyIssuer, resolveSupabaseTarget, targetHost, type TargetFailure } from "./supabaseTarget.ts";

/**
 * The environment resolver's tests - Entry 24's audit and the rules documented in
 * supabaseTarget.ts.
 *
 * Every case injects a plain environment object, so nothing here reads a file, touches the
 * network, or involves a real credential: the "keys" below are synthetic tokens whose only
 * content is an issuer claim.
 */

/** A synthetic key carrying the given issuer. No secret, no signature, no real token. */
function keyWithIssuer(issuer: string): string {
  const payload = Buffer.from(JSON.stringify({ iss: issuer })).toString("base64url");

  return `header.${payload}.signature`;
}

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_KEY = keyWithIssuer("supabase-demo");
const HOSTED_URL = "https://abcdefghijklmnop.supabase.co";
const HOSTED_KEY = keyWithIssuer("supabase");

const LOCAL_PAIR = { SOMAMAP_LOCAL_SUPABASE_URL: LOCAL_URL, SOMAMAP_LOCAL_ANON_KEY: LOCAL_KEY };
const HOSTED_PAIR = { NEXT_PUBLIC_SUPABASE_URL: HOSTED_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: HOSTED_KEY };

function resolve(overrides: Record<string, string | undefined> = {}) {
  return resolveSupabaseTarget({ ...overrides });
}

/** The refusal reason, or null when the configuration was accepted. */
function refusal(overrides: Record<string, string | undefined>): TargetFailure | null {
  const result = resolve(overrides);

  return result.ok ? null : result.reason;
}

describe("key issuer", () => {
  it("reads the issuer claim without touching the signature", () => {
    assert.equal(keyIssuer(LOCAL_KEY), "supabase-demo");
    assert.equal(keyIssuer(HOSTED_KEY), "supabase");
  });

  it("returns null for anything that is not a readable token", () => {
    for (const value of ["", "not-a-token", "header..signature", "header.bm90LWpzb24.signature"]) {
      assert.equal(keyIssuer(value), null, value);
    }
  });
});

describe("a valid local target", () => {
  it("accepts the local pair and derives the mode from the host", () => {
    const result = resolve(LOCAL_PAIR);

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.target.mode : "", "local");
    assert.equal(result.ok ? result.target.baseUrl : "", LOCAL_URL);
    assert.equal(result.ok ? result.target.anonKey : "", LOCAL_KEY);
    assert.equal(result.ok ? targetHost(result.target) : "", "127.0.0.1");
  });

  it("normalises a trailing slash away", () => {
    const result = resolve({ SOMAMAP_LOCAL_SUPABASE_URL: `${LOCAL_URL}/`, SOMAMAP_LOCAL_ANON_KEY: LOCAL_KEY });

    assert.equal(result.ok ? result.target.baseUrl : "", LOCAL_URL);
  });

  it("accepts every approved loopback host", () => {
    for (const host of ["127.0.0.1:54321", "localhost:54321", "[::1]:54321"]) {
      const result = resolve({ SOMAMAP_LOCAL_SUPABASE_URL: `http://${host}`, SOMAMAP_LOCAL_ANON_KEY: LOCAL_KEY });

      assert.equal(result.ok, true, host);
      assert.equal(result.ok ? result.target.mode : "", "local", host);
    }
  });

  it("accepts a loopback target configured through the hosted names", () => {
    const result = resolve({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_KEY });

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.target.mode : "", "local");
  });

  it("prefers the local pair when both pairs are complete", () => {
    const result = resolve({ ...HOSTED_PAIR, ...LOCAL_PAIR });

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.target.mode : "", "local");
    assert.equal(result.ok ? result.target.anonKey : "", LOCAL_KEY);
  });
});

describe("a valid hosted target", () => {
  it("accepts the hosted pair and calls it hosted", () => {
    const result = resolve(HOSTED_PAIR);

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.target.mode : "", "hosted");
    assert.equal(result.ok ? result.target.baseUrl : "", HOSTED_URL);
    assert.equal(result.ok ? targetHost(result.target) : "", "abcdefghijklmnop.supabase.co");
  });
});


describe("the mixed pair, in both directions", () => {
  it("refuses a local URL whose key is the hosted one", () => {
    assert.equal(
      refusal({ SOMAMAP_LOCAL_SUPABASE_URL: LOCAL_URL, SOMAMAP_LOCAL_ANON_KEY: HOSTED_KEY }),
      "local-key-not-local",
    );
  });

  it("refuses a local URL with no local key, even when the hosted pair is present", () => {
    assert.equal(refusal({ SOMAMAP_LOCAL_SUPABASE_URL: LOCAL_URL, ...HOSTED_PAIR }), "incomplete-local-pair");
  });

  it("refuses a hosted URL carrying a local demo key", () => {
    assert.equal(
      refusal({ NEXT_PUBLIC_SUPABASE_URL: HOSTED_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_KEY }),
      "hosted-key-is-local",
    );
  });

  it("refuses a loopback URL through the hosted names when the key is the hosted one", () => {
    assert.equal(
      refusal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: HOSTED_KEY }),
      "local-key-not-local",
    );
  });
});

describe("incomplete and missing configuration", () => {
  it("refuses an empty environment", () => {
    assert.equal(refusal({}), "missing-configuration");
  });

  it("treats blank values as missing", () => {
    assert.equal(refusal({ SOMAMAP_LOCAL_SUPABASE_URL: "   ", SOMAMAP_LOCAL_ANON_KEY: "" }), "missing-configuration");
  });

  it("refuses half a local pair, either way round", () => {
    assert.equal(refusal({ SOMAMAP_LOCAL_SUPABASE_URL: LOCAL_URL }), "incomplete-local-pair");
    assert.equal(refusal({ SOMAMAP_LOCAL_ANON_KEY: LOCAL_KEY }), "incomplete-local-pair");
  });

  it("refuses half a hosted pair, either way round", () => {
    assert.equal(refusal({ NEXT_PUBLIC_SUPABASE_URL: HOSTED_URL }), "incomplete-hosted-pair");
    assert.equal(refusal({ NEXT_PUBLIC_SUPABASE_ANON_KEY: HOSTED_KEY }), "incomplete-hosted-pair");
  });
});

describe("URL validation", () => {
  it("refuses anything that is not an absolute http(s) URL", () => {
    for (const url of ["not a url", "://127.0.0.1:54321", "ftp://127.0.0.1:54321", "http://", "/relative"]) {
      assert.equal(refusal({ SOMAMAP_LOCAL_SUPABASE_URL: url, SOMAMAP_LOCAL_ANON_KEY: LOCAL_KEY }), "invalid-url", url);
    }
  });

  it("refuses a base URL carrying a path", () => {
    assert.equal(
      refusal({ SOMAMAP_LOCAL_SUPABASE_URL: `${LOCAL_URL}/rest/v1`, SOMAMAP_LOCAL_ANON_KEY: LOCAL_KEY }),
      "invalid-url",
    );
  });

  it("refuses a local target that is not loopback", () => {
    for (const url of ["https://abcdefghijklmnop.supabase.co", "http://192.168.0.10:54321", "http://example.test"]) {
      assert.equal(
        refusal({ SOMAMAP_LOCAL_SUPABASE_URL: url, SOMAMAP_LOCAL_ANON_KEY: LOCAL_KEY }),
        "local-url-not-loopback",
        url,
      );
    }
  });
});

describe("what a refusal reveals", () => {
  it("carries a category and nothing else: no URL, no key", () => {
    const result = resolve({ SOMAMAP_LOCAL_SUPABASE_URL: LOCAL_URL, SOMAMAP_LOCAL_ANON_KEY: HOSTED_KEY });
    const serialised = JSON.stringify(result);

    assert.equal(result.ok, false);
    assert.equal(serialised.includes(LOCAL_URL), false);
    assert.equal(serialised.includes(HOSTED_KEY), false);
    assert.equal(serialised.includes("supabase.co"), false);
  });
});
