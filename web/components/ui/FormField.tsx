import type { ReactNode } from "react"

/** "md" suits top-level form fields; "sm" suits dense, repeated rows. */
export type FormFieldSize = "md" | "sm"

const LABEL_STYLES: Record<FormFieldSize, string> = {
  md: "block text-sm text-gray-400 mb-1.5",
  sm: "block text-xs text-gray-500 mb-1",
}

interface Props {
  label: string
  size?: FormFieldSize
  /** Classes for the wrapper, e.g. "col-span-2" inside a grid. */
  className?: string
  /** The control itself: an <input>, <select>, <textarea>... */
  children: ReactNode
}

/** A label stacked above a form control, with consistent spacing and type. */
export default function FormField({ label, size = "md", className, children }: Props) {
  return (
    <div className={className}>
      <label className={LABEL_STYLES[size]}>{label}</label>
      {children}
    </div>
  )
}
