import Chip from "@/components/global/Chip"
import { useApi } from "@/components/providers/ContentProvider"
import { type NumberItem, formatNumber } from "@/lib/numbers"

export default function Numbers() {
  const { data } = useApi()
  const { label, items } = data.numbers.attributes
  return (
    <section className="flex flex-col gap-8">
      <Chip>{label}</Chip>
      <ul className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {items.map((item: NumberItem) => (
          <li key={item.id} className="flex min-w-0 flex-col gap-1">
            <span className="font-display text-primary text-[clamp(2.5rem,5.5vw,4.5rem)] leading-none font-medium tracking-[-0.02em] [overflow-wrap:anywhere] tabular-nums">
              {formatNumber(item)}
            </span>
            <span className="text-[0.9375rem]">{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
