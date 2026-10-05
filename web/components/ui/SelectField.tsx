import FormField, { type FormFieldVariant } from "./FormField"

export interface SelectOption {
  value: string
  label: string
}

const SELECT_STYLES: Record<FormFieldVariant, string> = {
  default: "input-dark text-sm",
  compact: "input-dark text-sm",
  caps: "input-dark text-sm py-2.5",
}

interface Props {
  label: string
  value: string
  /** Receives the chosen option's value directly, not the DOM event. */
  onChange: (value: string) => void
  options: readonly SelectOption[]
  variant?: FormFieldVariant
  className?: string
}

/**
 * A labelled dropdown. Every option carries an explicit `value`, so what the
 * user sees (`label`) can differ from what is stored and sent (`value`).
 */
export default function SelectField({
  label,
  value,
  onChange,
  options,
  variant = "default",
  className,
}: Props) {
  return (
    <FormField label={label} variant={variant} className={className}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_STYLES[variant]}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  )
}
