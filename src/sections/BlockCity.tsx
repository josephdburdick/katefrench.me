import { CELLS, cityLayout } from "@/lib/block-city"
import { type NumberItem, blocksFor, captionFor } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"

import type { CityScene } from "./BlockCityScene"

type CityButton = { text: string; number: string; phrase: string }

export type City = { label: string; buttons: CityButton[] }

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
  const [auto, setAuto] = useState(true)
  const [inView, setInView] = useState(false)
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
    if (!stageEl) return
    const seen = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.5 },
    )
    seen.observe(stageEl)
    return () => seen.disconnect()
  }, [])

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
  const cycling = auto && !still && inView && choices.length > 1

  return (
    <div className="contents">
      <div className="min-w-0 md:col-start-2 md:row-span-2 md:row-start-1 md:self-center">
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
              className={cn(
                "absolute inset-0 size-full",
                !drawn && "invisible",
              )}
            />
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4 md:col-start-1 md:row-start-2">
        <div
          role="group"
          aria-label={city.label}
          className="-mx-4 flex flex-col gap-1"
        >
          {choices.map((c, i) => {
            const caption = captionFor(c.item, c.phrase)
            const active = i === selected
            return (
              <button
                key={c.number}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setAuto(false)
                  setSelected(i)
                }}
                className={cn(
                  "focus-visible:outline-primary relative cursor-pointer overflow-hidden rounded-lg px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-colors motion-safe:duration-300",
                  active
                    ? "bg-background text-foreground"
                    : "text-foreground/55 hover:bg-background/60 hover:text-foreground",
                )}
              >
                <span className="block text-[0.8125rem] font-medium">
                  {c.text}
                </span>
                <span className="block text-[1.0625rem]">
                  <strong className="font-semibold">{caption.lead}</strong>{" "}
                  {caption.rest}
                </span>
                {active && cycling && (
                  <span
                    aria-hidden="true"
                    onAnimationEnd={() =>
                      setSelected((n) => (n + 1) % choices.length)
                    }
                    className="bg-primary absolute inset-x-0 bottom-0 h-[3px] origin-left animate-[city-progress_5s_linear_forwards]"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
