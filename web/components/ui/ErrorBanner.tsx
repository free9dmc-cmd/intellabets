interface Props {
  /** Renders nothing when empty, so callers can pass error state straight through. */
  message: string
  /** Extra classes for spacing, e.g. "mb-4". */
  className?: string
}

export default function ErrorBanner({ message, className = "" }: Props) {
  if (!message) return null

  return (
    <div
      className={`p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm ${className}`.trim()}
    >
      {message}
    </div>
  )
}
