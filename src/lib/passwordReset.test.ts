import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  carriesRecoveryMarker,
  passwordProblem,
  readRecoveryPayload,
  RECOVERY_MAX_PASSWORD_LENGTH,
  RECOVERY_MIN_PASSWORD_LENGTH,
} from "./passwordReset.ts";

/**
 * A JWT-shaped string carrying the given payload, with no valid signature.
 *
 * That is the point: the marker reader only decodes, it never verifies - verification belongs to the account
 * service, and `passwordResetCall.test.ts` covers the request that asks it. A forged claim therefore travels
 * with a token the service refuses, which is why reading it is safe.
 */
function tokenWith(payload: unknown): string {
  return `header.${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}.signature`;
}

const RECOVERY_FRAGMENT = "#access_token=token-value&expires_in=3600&refresh_token=refresh-value&token_type=bearer&type=recovery";

describe("reading a recovery link", () => {
  it("reads the fragment the default email template produces", () => {
    assert.deepEqual(readRecoveryPayload(RECOVERY_FRAGMENT, ""), { kind: "token", token: "token-value" });
  });

  it("reads a hashed link from the query", () => {
    assert.deepEqual(readRecoveryPayload("", "?token_hash=hashed-value&type=recovery"), {
      kind: "tokenHash",
      tokenHash: "hashed-value",
    });
  });

  it("reports the provider's own refusal as expired, not as 'no link here'", () => {
    assert.deepEqual(readRecoveryPayload("#error=access_denied&error_code=otp_expired&error_description=gone", ""), {
      kind: "expired",
    });
  });

  it("carries nothing for an ordinary page view", () => {
    assert.deepEqual(readRecoveryPayload("", ""), { kind: "none" });
    assert.deepEqual(readRecoveryPayload("#section", "?utm=email"), { kind: "none" });
    assert.deepEqual(readRecoveryPayload("#", "?"), { kind: "none" });
  });

  it("refuses a fragment that belongs to another flow", () => {
    assert.deepEqual(readRecoveryPayload("#access_token=token-value&type=signup", ""), { kind: "none" });
  });

  it("accepts a fragment with no type only when the token says recovery", () => {
    const recovery = tokenWith({ amr: [{ method: "recovery" }] });
    const password = tokenWith({ amr: [{ method: "password" }] });

    assert.deepEqual(readRecoveryPayload(`#access_token=${recovery}`, ""), { kind: "token", token: recovery });
    assert.deepEqual(readRecoveryPayload(`#access_token=${password}`, ""), { kind: "none" });
  });

  it("ignores a hashed link that names another type", () => {
    assert.deepEqual(readRecoveryPayload("", "?token_hash=hashed-value&type=invite"), { kind: "none" });
  });
});

describe("the recovery marker", () => {
  it("is true for a recovery, false for another method, and unknown without the claim", () => {
    assert.equal(carriesRecoveryMarker(tokenWith({ amr: [{ method: "recovery" }] })), true);
    assert.equal(carriesRecoveryMarker(tokenWith({ amr: [{ method: "password" }, { method: "recovery" }] })), true);
    assert.equal(carriesRecoveryMarker(tokenWith({ amr: [{ method: "password" }] })), false);
    assert.equal(carriesRecoveryMarker(tokenWith({ sub: "user-id" })), null);
    assert.equal(carriesRecoveryMarker(tokenWith({ amr: "recovery" })), null);
  });

  it("is unknown for anything that is not a readable token", () => {
    for (const value of ["", "not-a-token", "a.b", "a.!!!!.c", `a.${Buffer.from("not json").toString("base64url")}.c`]) {
      assert.equal(carriesRecoveryMarker(value), null, value);
    }
  });
});

describe("the two typed passwords", () => {
  it("accepts a matching pair at the minimum length", () => {
    const shortest = "a".repeat(RECOVERY_MIN_PASSWORD_LENGTH);

    assert.equal(passwordProblem(shortest, shortest), null);
    assert.equal(passwordProblem("a longer passphrase", "a longer passphrase"), null);
  });

  it("refuses an empty pair, a short one, an over-long one and a mismatch", () => {
    assert.equal(passwordProblem("", ""), "empty");
    assert.equal(passwordProblem("one", ""), "empty");
    assert.equal(passwordProblem("short", "short"), "short");
    assert.equal(
      passwordProblem("a".repeat(RECOVERY_MAX_PASSWORD_LENGTH + 1), "a".repeat(RECOVERY_MAX_PASSWORD_LENGTH + 1)),
      "long",
    );
    assert.equal(passwordProblem("a long enough one", "a long enough two"), "mismatch");
  });
});
