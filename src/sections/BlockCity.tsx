import { type NumberItem, blocksFor, captionFor } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { useState } from "react"

type CityButton = { text: string; number: string; phrase: string }

export type City = { label: string; buttons: CityButton[]; key: string }

const blocks = Array.from({ length: 100 }, (_, i) => i)

export default function BlockCity({
  city,
  items,
}: {
  city: City
  items: NumberItem[]
}) {
  const choices = city.buttons.flatMap((button) => {
    const item = items.find((i) => i.id === button.number)
    return item ? [{ ...button, item }] : []
  })
  const [selected, setSelected] = useState(0)
  const choice = choices[selected]
  if (!choice) return null
  const lit = blocksFor(choice.item)
  const caption = captionFor(choice.item, choice.phrase)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        role="group"
        aria-label={city.label}
        className="flex flex-wrap gap-2"
      >
        {choices.map((c, i) => (
          <button
            key={c.number}
            type="button"
            aria-pressed={i === selected}
            onClick={() => setSelected(i)}
            className={cn(
              "focus-visible:outline-primary cursor-pointer rounded-full border px-[0.9rem] py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2",
              i === selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground",
            )}
          >
            {c.text}
          </button>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="grid w-full max-w-sm grid-cols-10 gap-1"
      >
        {blocks.map((i) => (
          <span
            key={i}
            className={cn(
              "aspect-square rounded-[3px] motion-safe:transition-colors motion-safe:duration-300",
              i < lit ? "bg-primary" : "bg-background",
            )}
          />
        ))}
      </div>
      <p aria-live="polite" className="text-[1.0625rem]">
        <strong className="font-semibold">{caption.lead}</strong> {caption.rest}
      </p>
      <p className="text-foreground/70 text-[0.8125rem]">{city.key}</p>
    </div>
  )
}
