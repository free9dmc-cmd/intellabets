type Tone = "default" | "positive"

interface Props {
  label: string
  value: string
  /** "positive" highlights a good number, such as a potential return. */
  tone?: Tone
  /** Draw the tile as a bordered box rather than bare text. */
  framed?: boolean
}

const VALUE_TONES: Record<Tone, string> = {
  default: "text-white",
  positive: "text-emerald-400",
}

const FRAME_STYLES: Record<Tone, string> = {
  default: "p-3 rounded-lg bg-white/3 border border-gray-800 text-center",
  positive: "p-3 rounded-lg bg-emerald-500/8 border border-emerald-500/20 text-center",
}

/** A single figure with a caption underneath, centered. */
export default function StatTile({ label, value, tone = "default", framed = false }: Props) {
  return (
    <div className={framed ? FRAME_STYLES[tone] : undefined}>
      <div className={`${VALUE_TONES[tone]} font-bold`}>{value}</div>
      <div className={framed ? "text-gray-500 text-xs mt-0.5" : "text-gray-500 text-xs"}>{label}</div>
    </div>
  )
}
