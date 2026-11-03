import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_SIGN_IN_DESTINATION, signInDestination } from "./signInDestination.ts";

/**
 * Where a sign-in lands (`ISS-17`).
 *
 * The rule is an exact-match allow-list, and these are the values an attacker would try: absolute URLs,
 * protocol-relative URLs, schemes, encodings, case changes, queries, fragments, traversals, repeated
 * parameters. Every one of them must fall back to the journal, because the sign-in screen is the one
 * place in this app where a careless redirect becomes an open one.
 */
describe("the sign-in destination", () => {
  it("defaults to the journal", () => {
    assert.equal(DEFAULT_SIGN_IN_DESTINATION, "/journal");
    assert.equal(signInDestination(undefined), "/journal");
    assert.equal(signInDestination(null), "/journal");
    assert.equal(signInDestination(""), "/journal");
  });

  it("accepts this app's own paths, exactly as written", () => {
    for (const path of ["/", "/journal", "/checkin", "/settings"]) {
      assert.equal(signInDestination(path), path);
    }
  });

  it("refuses an absolute URL, a protocol-relative URL, or a scheme", () => {
    for (const value of [
      "https://evil.example",
      "http://evil.example/journal",
      "//evil.example",
      "//evil.example/journal",
      "javascript:alert(1)",
      "data:text/html,x",
      "mailto:someone@example.com",
      "ftp://evil.example",
    ]) {
      assert.equal(signInDestination(value), DEFAULT_SIGN_IN_DESTINATION, value);
    }
  });

  it("refuses anything that is not exactly one of those paths", () => {
    for (const value of [
      "/journal/",
      "/journal?x=1",
      "/journal#fragment",
      "/journal/../settings",
      "/journal/1234",
      "/JOURNAL",
      " journal",
      "/journal ",
      "%2Fjournal",
      "%2fjournal",
      "/settings/../journal",
      "/checkin/",
      "/index.html",
      "/journal/",
      "/Journal",
    ]) {
      assert.equal(signInDestination(value), DEFAULT_SIGN_IN_DESTINATION, value);
    }
  });

  it("refuses a repeated parameter, which arrives as an array", () => {
    assert.equal(signInDestination(["/settings"]), DEFAULT_SIGN_IN_DESTINATION);
    assert.equal(signInDestination(["/settings", "/journal"]), DEFAULT_SIGN_IN_DESTINATION);
    assert.equal(signInDestination([]), DEFAULT_SIGN_IN_DESTINATION);
  });

  it("always answers with a path this app serves, whatever it is given", () => {
    const served = ["/", "/journal", "/checkin", "/settings"];

    for (const value of [undefined, "", "/nope", "https://evil.example", "/journal?x=1", "/settings"]) {
      const destination = signInDestination(value);

      assert.ok(served.includes(destination), `${String(value)} produced ${destination}`);
      assert.ok(destination.startsWith("/") && !destination.startsWith("//"));
    }
  });
});
