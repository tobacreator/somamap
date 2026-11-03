import { resolveBasetenConfig } from "./baseten.ts";
import { modelMode } from "./models.ts";

/**
 * Which model processing this deployment will actually use (`ISS-18`).
 *
 * The live path has existed since Phase 2F and is complete: `adapterFor("live", …)` builds the Baseten
 * adapter when the provider configuration resolves, and the adapter that refuses every call when it does
 * not. What was missing is the ability to *tell the difference* from outside the process. A build with
 * `MODEL_MODE=live` and no key is not broken - it is safe, it asks the reviewed questions, and every card
 * renders the reviewed fallback - but it looks exactly like a working live build, because the fallback is
 * a compliant card by design. That is what this module exists to fix: one pure function that says which
 * of the three states the running process is in.
 *
 * The three states, and nothing in between:
 *
 *   - **mock** - the default. The interview is worded from the recorded fixtures, no provider exists, and
 *     nothing can leave the process. `sends: false` is the same fact the user's disclosure states.
 *   - **live, ready** - the key, the Baseten host, the model id and the timeout all resolved. The host,
 *     the model id and the timeout are reported; **the key never is**, and it is not even destructured
 *     out of the resolved configuration here.
 *   - **live, refused** - live mode is on but the configuration was refused, so the adapter that cannot
 *     call anyone is in use. The reason is one of the resolver's own closed-set categories, which are
 *     safe to display by construction: they name the *kind* of problem, never the value that caused it.
 *
 * Pure and injectable, so every state is unit-tested with an injected environment and no key.
 */
export type ProviderReadiness =
  | { mode: "mock"; sends: false }
  | { mode: "live"; sends: true; ok: true; host: string; model: string; timeoutMs: number }
  | { mode: "live"; sends: true; ok: false; reason: string };

/** Which processing this environment will use. Never returns the key, and never a full URL. */
export function providerReadiness(env: Record<string, string | undefined> = process.env): ProviderReadiness {
  const mode = modelMode(env);

  if (mode === "mock") return { mode: "mock", sends: false };

  const resolution = resolveBasetenConfig(env);

  if (!resolution.ok) return { mode: "live", sends: true, ok: false, reason: resolution.reason };

  const { baseUrl, model, timeoutMs } = resolution.config;

  return { mode: "live", sends: true, ok: true, host: hostOf(baseUrl), model, timeoutMs };
}

/** The host of a resolved base URL, or the text itself when it cannot be read. Never a path or a query. */
function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "<unreadable>";
  }
}
