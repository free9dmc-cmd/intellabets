import type { ReactNode } from "react"

/**
 * Label styles:
 *  - "default": top-level form fields
 *  - "compact": dense, repeated rows
 *  - "caps":    small uppercase captions above option pickers
 */
export type FormFieldVariant = "default" | "compact" | "caps"

const LABEL_STYLES: Record<FormFieldVariant, string> = {
  default: "block text-sm text-gray-400 mb-1.5",
  compact: "block text-xs text-gray-500 mb-1",
  caps: "block text-xs text-gray-500 uppercase tracking-wide mb-2",
}

interface Props {
  label: string
  variant?: FormFieldVariant
  /** Classes for the wrapper, e.g. "col-span-2" inside a grid. */
  className?: string
  /** The control itself: an <input>, <select>, <textarea>... */
  children: ReactNode
}

/** A label stacked above a form control, with consistent spacing and type. */
export default function FormField({ label, variant = "default", className, children }: Props) {
  return (
    <div className={className}>
      <label className={LABEL_STYLES[variant]}>{label}</label>
      {children}
    </div>
  )
}
