import Button from "@/components/Button";
import Panel from "@/components/Panel";
import { CRISIS_BACK, CRISIS_BODY, CRISIS_RESOURCES_LEGEND, CRISIS_TITLE } from "@/lib/copy";
import { CRISIS_RESOURCES } from "@/lib/crisis";

/**
 * The static crisis screen - iron rule 4 and blueprint Table 5.
 *
 * Static by design: no input, no state, no model, no network. It shows the blueprint's contact
 * details and the way back, and it never repeats what was typed - echoing crisis language back at
 * someone is not this screen's job, and the matched phrase is kept only for the record.
 *
 * Phase B changed only the surfaces: the tokens, the shared panel, the shared button. The
 * composition is deliberately unchanged - title, the sentence about what was not saved, the
 * contacts, the way back - because this is the screen that must not be surprising. The fixed line
 * now arrives once from the shell's footer rather than from a paragraph here.
 *
 * The contacts legend stays an `h2` rather than the shared step label: it is a real heading for the
 * list below it, and the shared label renders a paragraph.
 */
export default function CrisisScreen({ onBack }: { onBack: () => void }) {
  return (
    <section aria-labelledby="crisis-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="crisis-title" className="text-2xl font-semibold tracking-tight text-ink">
          {CRISIS_TITLE}
        </h1>
        <p className="text-body leading-6 text-ink">{CRISIS_BODY}</p>
      </div>

      <Panel>
        <h2 className="text-meta font-medium text-ink-muted">{CRISIS_RESOURCES_LEGEND}</h2>

        <ul className="flex flex-col gap-3">
          {CRISIS_RESOURCES.map((resource) => (
            <li key={resource.region} className="flex flex-col">
              <span className="text-label text-ink-muted">{resource.region}</span>
              <span className="text-lead font-medium text-ink">{resource.action}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Button variant="secondary" onClick={onBack} className="self-start">
        {CRISIS_BACK}
      </Button>
    </section>
  );
}

