import Button from "@/components/Button";
import Panel from "@/components/Panel";
import {
  EXTERNAL_PROCESSING_DECLINE,
  EXTERNAL_PROCESSING_DISCLOSURE,
  EXTERNAL_PROCESSING_TITLE,
} from "@/lib/copy";
import type { ProcessingMode } from "@/lib/externalProcessing";

/**
 * The external processing disclosure - Phase 2D.
 *
 * The one screen that stands between the user's words and whatever processes them. It says who does the
 * wording and which words those are, and it offers exactly two ways on: an explicit acknowledgement, or
 * nothing at all. There is no pre-ticked box, no default button and no path to the interview that skips
 * this screen - the check-in flow renders this instead of the interview until the acknowledgement is
 * given, and the server refuses any turn that does not carry it.
 *
 * **The wording is the mode's own** (`mode` arrives from the server, never from a guess): in mock mode
 * there is no external provider and the copy says so, rather than telling the user their words are going
 * to Baseten when no request leaves the process; in live mode it names Baseten, the words that go there,
 * and that they may be sent again as the interview continues.
 *
 * It deliberately says nothing about what a provider does with the words afterwards: no retention,
 * deletion, training, storage, encryption or location claim is made anywhere in this build, because
 * none of those has been independently verified. It also does not repeat the fixed line - that
 * sentence has one home and one render site, and this panel adds to it rather than standing in for it.
 *
 * Presentational only: it holds no state, and the acknowledgement it reports is the check-in flow's.
 */
export default function ExternalProcessingNotice({
  mode,
  onAcknowledge,
  onDecline,
}: {
  mode: ProcessingMode;
  onAcknowledge: () => void;
  onDecline: () => void;
}) {
  const disclosure = EXTERNAL_PROCESSING_DISCLOSURE[mode];

  return (
    <Panel>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{EXTERNAL_PROCESSING_TITLE}</h1>
      <p className="text-body leading-6 text-ink">{disclosure.ai}</p>
      <p className="text-body leading-6 text-ink-muted">{disclosure.data}</p>

      {/* Two ways on, and no third: the acknowledgement, or back to the check-in with nothing sent. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button id="external-processing-acknowledge" onClick={onAcknowledge}>
          {disclosure.acknowledge}
        </Button>
        <Button id="external-processing-decline" variant="secondary" onClick={onDecline}>
          {EXTERNAL_PROCESSING_DECLINE}
        </Button>
      </div>
    </Panel>
  );
}
