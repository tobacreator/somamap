import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { providerReadiness } from "./providerReadiness.ts";

/**
 * Which processing a deployment will use (`ISS-18`).
 *
 * Three states, and the tests that matter most are the ones about what this value must **not** carry: no
 * key, no full URL, no path. The readiness value is rendered on a screen, so anything it holds is
 * something the screen shows.
 */
const KEY = "placeholder-not-a-real-credential";

describe("which processing this deployment will use", () => {
  it("is mock by default, and says nothing is sent", () => {
    assert.deepEqual(providerReadiness({}), { mode: "mock", sends: false });
    assert.deepEqual(providerReadiness({ MODEL_MODE: "mock" }), { mode: "mock", sends: false });
    assert.deepEqual(providerReadiness({ MODEL_MODE: "LIVE" }), { mode: "mock", sends: false });
    assert.deepEqual(providerReadiness({ MODEL_MODE: "live ", BASETEN_API_KEY: KEY }), {
      mode: "mock",
      sends: false,
    });
  });

  it("is live and ready when the provider configuration resolves", () => {
    assert.deepEqual(providerReadiness({ MODEL_MODE: "live", BASETEN_API_KEY: KEY }), {
      mode: "live",
      sends: true,
      ok: true,
      host: "inference.baseten.co",
      model: "meta-models/muse-spark-open-1026",
      timeoutMs: 20_000,
    });
  });

  it("is live and refused when it does not, with the resolver's own category", () => {
    assert.deepEqual(providerReadiness({ MODEL_MODE: "live" }), {
      mode: "live",
      sends: true,
      ok: false,
      reason: "missing-key",
    });

    assert.deepEqual(
      providerReadiness({ MODEL_MODE: "live", BASETEN_API_KEY: KEY, BASETEN_BASE_URL: "https://evil.example/v1" }),
      { mode: "live", sends: true, ok: false, reason: "not-baseten-host" },
    );

    assert.deepEqual(providerReadiness({ MODEL_MODE: "live", BASETEN_API_KEY: KEY, BASETEN_TIMEOUT_MS: "5" }), {
      mode: "live",
      sends: true,
      ok: false,
      reason: "bad-timeout",
    });
  });

  it("never carries the key, in any of the three states", () => {
    const environments = [
      { MODEL_MODE: "mock", BASETEN_API_KEY: KEY },
      { MODEL_MODE: "live", BASETEN_API_KEY: KEY },
      { MODEL_MODE: "live", BASETEN_API_KEY: KEY, BASETEN_MODEL: "not a model id" },
    ];

    for (const env of environments) {
      const serialised = JSON.stringify(providerReadiness(env));

      assert.equal(serialised.includes(KEY), false, serialised);
    }
  });

  it("reports the host alone, never the path or the query", () => {
    const ready = providerReadiness({
      MODEL_MODE: "live",
      BASETEN_API_KEY: KEY,
      BASETEN_BASE_URL: "https://inference.baseten.co/v1",
    });

    assert.equal(ready.mode === "live" && ready.ok ? ready.host : null, "inference.baseten.co");
    assert.equal(JSON.stringify(ready).includes("/v1"), false);
  });
});
