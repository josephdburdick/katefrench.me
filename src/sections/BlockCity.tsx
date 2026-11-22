import { CELLS, cityLayout } from "@/lib/block-city"
import { type NumberItem, blocksFor, captionFor } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"

import type { CityScene } from "./BlockCityScene"

type CityButton = { text: string; number: string; phrase: string }

export type City = { label: string; buttons: CityButton[]; key: string }

const blocks = Array.from({ length: CELLS }, (_, i) => i)
const { rank } = cityLayout()

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
  const [still] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  const [drawn, setDrawn] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const scene = useRef<CityScene | null>(null)
  const choice = choices[selected]
  const lit = choice ? blocksFor(choice.item) : 0
  const litRef = useRef(lit)

  useEffect(() => {
    litRef.current = lit
    scene.current?.light(lit)
  }, [lit])

  useEffect(() => {
    const stageEl = stage.current
    const canvasEl = canvas.current
    if (still || !stageEl || !canvasEl) return
    let unmounted = false
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        near.disconnect()
        import("./BlockCityScene")
          .then(({ createCityScene }) => {
            if (unmounted) return
            scene.current = createCityScene(stageEl, canvasEl, () =>
              setDrawn(true),
            )
            scene.current?.light(litRef.current)
          })
          .catch(() => {})
      },
      { rootMargin: "100% 0px" },
    )
    near.observe(stageEl)
    return () => {
      unmounted = true
      near.disconnect()
      scene.current?.dispose()
      scene.current = null
    }
  }, [still])

  if (!choice) return null
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
                ? "border-primary bg-primary text-foreground"
                : "border-border bg-background text-foreground",
            )}
          >
            {c.text}
          </button>
        ))}
      </div>
      <div
        ref={stage}
        aria-hidden="true"
        className="relative aspect-[3/2] w-full"
      >
        <div
          className={cn(
            "mx-auto grid w-2/3 grid-cols-10 gap-1",
            drawn && "invisible",
          )}
        >
          {blocks.map((i) => (
            <span
              key={i}
              className={cn(
                "aspect-square rounded-[3px] motion-safe:transition-colors motion-safe:duration-300",
                rank[i] < lit ? "bg-primary" : "bg-background",
              )}
            />
          ))}
        </div>
        {!still && (
          <canvas
            ref={canvas}
            aria-hidden="true"
            className={cn("absolute inset-0 size-full", !drawn && "invisible")}
          />
        )}
      </div>
      <p aria-live="polite" className="text-[1.0625rem]">
        <strong className="font-semibold">{caption.lead}</strong> {caption.rest}
      </p>
      <p className="text-foreground/70 text-[0.8125rem]">{city.key}</p>
    </div>
  )
}
