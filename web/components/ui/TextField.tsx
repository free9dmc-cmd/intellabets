import type { InputHTMLAttributes } from "react"
import FormField, { type FormFieldSize } from "./FormField"

const INPUT_STYLES: Record<FormFieldSize, string> = {
  md: "input-dark",
  sm: "input-dark text-sm",
}

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "value" | "onChange" | "className"> {
  label: string
  value: string
  /** Receives the new text directly, so callers never touch the DOM event. */
  onChange: (value: string) => void
  size?: FormFieldSize
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
  size = "md",
  className,
  ...inputProps
}: Props) {
  return (
    <FormField label={label} size={size} className={className}>
      <input
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_STYLES[size]}
      />
    </FormField>
  )
}
