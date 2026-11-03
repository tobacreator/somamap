import Panel from "@/components/Panel";
import {
  PROCESSING_HOST,
  PROCESSING_LIVE,
  PROCESSING_MOCK,
  PROCESSING_MODEL,
  PROCESSING_NOT_READY,
  PROCESSING_NOT_READY_REASON,
  PROCESSING_TIMEOUT,
  PROCESSING_TITLE,
} from "@/lib/copy";
import { providerReadiness } from "@/lib/providerReadiness";

/**
 * Which processing this deployment is using (`ISS-18`) - the operator's own view of the model boundary.
 *
 * It is on Settings, beside the Supabase target, and for the same reason that panel is there: a screen
 * that states the environment it will act on is a screen where a misconfiguration is visible instead of
 * silent. The three states come from `providerReadiness` (src/lib/providerReadiness.ts); this component
 * only lays them out, and it never receives the key - the readiness value does not contain it.
 *
 * A server component on purpose: it reads the process environment, so it can only run where the
 * environment is authoritative. It is rendered only for a signed-in reader, like the rest of this screen.
 */
export default function ProcessingStatus() {
  const readiness = providerReadiness();

  return (
    <Panel>
      <h2 className="text-lead font-medium text-ink">{PROCESSING_TITLE}</h2>

      <p className="text-label leading-6 text-ink-muted">
        {readiness.mode === "mock" ? PROCESSING_MOCK : PROCESSING_LIVE}
      </p>

      {readiness.mode === "live" && readiness.ok ? (
        <dl className="flex flex-col gap-1 text-label">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-muted">{PROCESSING_HOST}</dt>
            <dd className="text-ink">{readiness.host}</dd>
          </div>

          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-muted">{PROCESSING_MODEL}</dt>
            <dd className="text-ink">{readiness.model}</dd>
          </div>

          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-muted">{PROCESSING_TIMEOUT}</dt>
            <dd className="text-ink">{readiness.timeoutMs} ms</dd>
          </div>
        </dl>
      ) : null}

      {readiness.mode === "live" && !readiness.ok ? (
        <p role="alert" className="flex flex-col text-label text-danger-text">
          <span className="font-medium">{PROCESSING_NOT_READY}</span>
          <span className="text-ink-muted">
            {PROCESSING_NOT_READY_REASON}: {readiness.reason}
          </span>
        </p>
      ) : null}
    </Panel>
  );
}
