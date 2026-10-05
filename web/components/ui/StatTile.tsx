interface Props {
  label: string
  value: string
  /** "positive" highlights a good number, such as a potential return. */
  tone?: "default" | "positive"
}

const VALUE_TONES: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-white",
  positive: "text-emerald-400",
}

/** A single figure with a caption underneath, centered. */
export default function StatTile({ label, value, tone = "default" }: Props) {
  return (
    <div>
      <div className={`${VALUE_TONES[tone]} font-bold`}>{value}</div>
      <div className="text-gray-500 text-xs">{label}</div>
    </div>
  )
}
