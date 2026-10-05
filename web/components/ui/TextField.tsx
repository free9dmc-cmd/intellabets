import type { InputHTMLAttributes } from "react"
import FormField from "./FormField"

type TextFieldVariant = "default" | "compact"

const INPUT_STYLES: Record<TextFieldVariant, string> = {
  default: "input-dark",
  compact: "input-dark text-sm",
}

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className"> {
  label: string
  value: string
  /** Receives the new text directly, so callers never touch the DOM event. */
  onChange: (value: string) => void
  variant?: TextFieldVariant
  /** Classes for the wrapper around label and input, e.g. "col-span-2". */
  className?: string
}

/**
 * A labelled text-style input. Any other <input> attribute (type, placeholder,
 * required, min, max, step...) passes straight through to the element.
 */
export default function TextField({
  label,
  value,
  onChange,
  variant = "default",
  className,
  ...inputProps
}: Props) {
  return (
    <FormField label={label} variant={variant} className={className}>
      <input
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_STYLES[variant]}
      />
    </FormField>
  )
}
