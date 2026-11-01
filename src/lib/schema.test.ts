import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FALLBACK_CARD, sensationCardSchema } from "./schema.ts";

describe("sensationCardSchema", () => {
  it("rejects a payload carrying an extra possible_cause field", () => {
    const payload = {
      ...FALLBACK_CARD,
      possible_cause: "a long day at the desk",
    };

    const result = sensationCardSchema.safeParse(payload);

    if (result.success) {
      assert.fail("a card with a possible_cause key must not parse");
    }

    assert.deepEqual(
      result.error.issues.map((issue) => issue.code),
      ["unrecognized_keys"],
    );
  });

  it("accepts FALLBACK_CARD", () => {
    const result = sensationCardSchema.safeParse(FALLBACK_CARD);

    assert.equal(result.success, true);
  });
});
