import { cn } from "@/lib/utils"
import { useState } from "react"

const chipClass =
  "border-primary/40 bg-background hover:border-primary hover:bg-primary/15 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground min-h-11 rounded-md border px-3 text-[0.9375rem] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"

const dayKey = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso))

/** A day, then a time on it, shown in the viewer's own time zone. */
export default function TimePicker({
  times,
  value,
  onPick,
}: {
  times: string[]
  value: string
  onPick: (time: string) => void
}) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [day, setDay] = useState("")
  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  })
  const days = new Map<string, string>()
  for (const time of times) {
    const key = dayKey(time, timeZone)
    if (!days.has(key)) days.set(key, dayLabel.format(new Date(time)))
  }
  const onDay = times.filter((time) => dayKey(time, timeZone) === day)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.9375rem]">
        Times are in your time zone, {timeZone}.
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Pick a day</legend>
        <div className="flex flex-wrap gap-2">
          {[...days].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === day}
              className={chipClass}
              onClick={() => setDay(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      {onDay.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">
            Times on {days.get(day)}
          </legend>
          <div className="flex flex-wrap gap-2">
            {onDay.map((time) => (
              <button
                key={time}
                type="button"
                aria-pressed={time === value}
                className={cn(chipClass, "min-w-20")}
                onClick={() => onPick(time)}
              >
                {timeLabel.format(new Date(time))}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}
