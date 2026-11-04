import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The interview route's public-demo guard (`ISS-27`), held still at the source.
 *
 * **Why this file is structural rather than behavioural, stated honestly:** the route imports
 * `next/server`, and plain `node --test` cannot resolve that extensionless specifier outside the Next
 * build (`ERR_MODULE_NOT_FOUND`). Importing the handler here would mean either changing a production
 * import to suit a test or adding a resolver - both worse than the gap they close.
 *
 * So each half is verified where it can be:
 *
 *   - the guard's own decisions are exercised **behaviourally** in `src/lib/demoBudget.test.ts` - the caps,
 *     the visitor key, the windows, the two counters, the bounded map - as pure functions with real
 *     assertions;
 *   - the route's **wiring** is asserted here: that the three refusals are decided before the state
 *     machine, that each answers with its own status, and that the adapter is constructed only on the path
 *     that passed the guard. `interviewStep` is the only thing in this route that can reach an adapter, so
 *     a refusal that returns before it cannot reach the model boundary.
 *
 * Nothing here reads a key or makes a request.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** `ROOT` is `src`, so the route is addressed from there. */
const ROUTE_FILE = join(ROOT, "app", "api", "interview", "route.ts");

const source = readFileSync(ROUTE_FILE, "utf8");

/** The one call that can reach a model adapter, and the three decisions that must precede it. */
const MACHINE = source.indexOf("interviewStep(body");
const DECLARED_SIZE = source.indexOf("declared > INTERVIEW_BODY_MAX_BYTES");
const BUDGET = source.indexOf("demoBudget.admit(");
const CAPS = source.indexOf("oversizedField(body)");
const ADAPTER = source.indexOf("adapterFor(");

describe("the interview route's public-demo guard", () => {
  it("still calls the state machine, so the interview itself is unchanged", () => {
    assert.ok(MACHINE !== -1, "the route must still call interviewStep");
    assert.ok(source.includes("adapterFor(mode)"), "the adapter must still come from the mode");
    assert.ok(source.includes('{ error: "unavailable" }'), "the 503 path must still be there");
  });

  it("decides every refusal before the state machine is called", () => {
    assert.ok(DECLARED_SIZE !== -1, "the declared body size must be checked");
    assert.ok(BUDGET !== -1, "the budget must be decided");
    assert.ok(CAPS !== -1, "the field caps must be checked");

    assert.ok(DECLARED_SIZE < MACHINE, "the body-size check must come first");
    assert.ok(BUDGET < MACHINE, "the budget must be decided before the state machine");
    assert.ok(CAPS < MACHINE, "the caps must be checked before the state machine");
  });

  it("constructs the adapter only after the guard has admitted the turn", () => {
    assert.ok(ADAPTER !== -1, "the route must still build its adapter");
    assert.equal(source.indexOf("adapterFor(", ADAPTER + 1), -1, "the adapter must be built in one place");
    assert.ok(BUDGET < ADAPTER, "no adapter on a turn the budget refused");
    assert.ok(CAPS < ADAPTER, "no adapter on a turn the caps refused");
  });

  it("answers each refusal with its own status and nothing else", () => {
    assert.ok(source.includes('{ error: "too large" }, { status: 413 }'), "an oversized body is a 413");
    assert.ok(source.includes('{ error: "too long" }, { status: 400 }'), "an over-length field is a 400");
    assert.ok(source.includes('{ error: "busy" }, { status: 429 }'), "a refused turn is a 429");
    assert.ok(source.includes("if (!decision.ok)"), "the 429 comes from the budget's own decision");
  });

  it("measures the body twice, because a chunked request carries no length header", () => {
    const headerCheck = source.indexOf('headers.get("content-length")');
    const readCheck = source.indexOf("rawBody.length > INTERVIEW_BODY_MAX_BYTES");

    assert.ok(headerCheck !== -1, "the declared length is checked");
    assert.ok(readCheck !== -1, "the text actually received is checked");
    assert.ok(headerCheck < readCheck, "the cheap check comes before the body is read");
  });

  it("never claims to be authentication, in its own words", () => {
    assert.ok(
      source.includes("What this deliberately is not: authentication"),
      "the route must say what the guard is not",
    );
    assert.equal(
      /currentSession|accessToken|authorization/i.test(source),
      false,
      "the interview route must not gain a session check: the flow is open without an account by design",
    );
  });
});
