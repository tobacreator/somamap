import { FOCUS_RING } from "@/components/Button";

/**
 * A labelled field: label, control, and an optional hint, wired together once.
 *
 * What it fixes: the two textareas were `rounded-xl p-3` and the two sign-in inputs were
 * `rounded-lg p-2`, so the same idea had two shapes. The hint is associated with the control
 * through `aria-describedby`, which is how a disabled submit button explains itself to someone who
 * cannot see that it is greyed out.
 *
 * The field is a bordered surface in the page's own colour rather than a filled box: the border is
 * the control boundary and it clears 3:1 in both modes (5.36:1 light, 5.05:1 dark).
 */
type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  required?: boolean;
};

export default function TextField({
  id,
  label,
  value,
  onChange,
  multiline = false,
  rows = 3,
  placeholder,
  hint,
  disabled = false,
  type = "text",
  autoComplete,
  required = false,
}: TextFieldProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const control = `w-full rounded-control border border-hairline bg-paper p-3 text-body text-ink placeholder:text-ink-muted ${FOCUS_RING}`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label font-medium text-ink">
        {label}
      </label>

      {multiline ? (
        <textarea
          id={id}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-describedby={hintId}
          className={control}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          required={required}
          aria-describedby={hintId}
          className={control}
        />
      )}

      {hint === undefined ? null : (
        <p id={hintId} className="text-meta leading-5 text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
