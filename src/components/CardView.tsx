import StepLabel from "@/components/StepLabel";
import { cardViewForPayload } from "@/lib/cardView";

/**
 * The card view - blueprint Section 6.1 and the repo layout's `src/components/CardView`.
 *
 * The screen renders exactly what the render model decides, and the model can only hold a card that
 * passed the strict five-field schema: a payload with an extra key renders as the reviewed fallback
 * instead. A row whose answer has not arrived renders as explicitly unanswered, so a placeholder is
 * never shown as if the user had said it.
 *
 * `usedFallback` is deliberately not displayed: a validation failure is the system's business, and
 * the user loses nothing but flourish when the fallback renders.
 *
 * Phase B changed the presentation, not the contract, and the change is the whole point: the user's
 * own sentence is now the hero of the card - first in reading order, in the humanist serif, at the
 * top of the type scale - because that sentence is what the product exists to help someone find. It
 * was the fifth row at the same weight as the other four. The other four fields keep their schema
 * order underneath, separated by hairlines. `cardViewForPayload` still returns five rows in schema
 * order; this component only decides which of them is presented as the hero.
 *
 * The heading and the fixed line belong to the screen: a card is a block of fields, not a page, and
 * keeping it that way is also what will let the print/export sheet reuse it unchanged.
 */
export default function CardView({ payload }: { payload: unknown }) {
  const model = cardViewForPayload(payload);
  const sentence = model.rows.find((row) => row.field === "user_own_sentence") ?? null;
  const fields = model.rows.filter((row) => row.field !== "user_own_sentence");

  return (
    <div className="flex flex-col gap-6">
      {sentence === null ? null : (
        <div className="flex flex-col gap-2">
          <StepLabel>{sentence.label}</StepLabel>
          <p
            className={`font-serif text-question md:text-display ${
              sentence.answered ? "text-ink" : "italic text-ink-muted"
            }`}
          >
            {sentence.display}
          </p>
        </div>
      )}

      <dl className="flex flex-col">
        {fields.map((row, index) => (
          <div key={row.field} className={`flex flex-col gap-1 py-3 ${index === 0 ? "" : "border-t border-rule"}`}>
            <dt>
              <StepLabel>{row.label}</StepLabel>
            </dt>
            <dd className={`text-lead ${row.answered ? "text-ink" : "italic text-ink-muted"}`}>{row.display}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

