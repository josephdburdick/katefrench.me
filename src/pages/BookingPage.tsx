import TimePicker from "@/components/booking/TimePicker"
import { loadAvailability } from "@/components/contact/submit"
import { inputClass } from "@/components/edit/fields"
import Footer from "@/components/global/Footer"
import Header from "@/components/global/Header"
import SiteLink from "@/components/global/SiteLink"
import { Button } from "@/components/ui/button"
import {
  BOOKING_NOTE_MAX,
  type BookingAction,
  type BookingResponse,
  formatCallTime,
} from "@/lib/contact-form"
import { cn } from "@/lib/utils"
import { type ReactNode, useEffect, useState } from "react"
import { useParams } from "react-router"

async function call(token: string, action?: BookingAction) {
  try {
    const response = await fetch(`/api/booking/${encodeURIComponent(token)}`, {
      method: action ? "POST" : "GET",
      ...(action && {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      }),
    })
    if (!response.ok) return null
    return (await response.json()) as BookingResponse
  } catch {
    return null
  }
}

const RETRY = "Something went wrong. Check your connection, then try again."

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

function resultText(
  result: BookingResponse,
  name: string,
  suggesting: boolean,
): string {
  const notEmailed = `The email to ${name} didn't go out, so please write to them yourself.`
  const tail = "emailed" in result && !result.emailed ? ` ${notEmailed}` : ""
  if (result.state === "confirmed") {
    return `Confirmed. ${name} has the video link by email.${tail}`
  }
  if (result.state === "declined") {
    return `Declined. ${name} will get a note that you'll reply by email.${tail}`
  }
  if (result.state === "suggested") {
    return `Sent. ${name} has your suggestion for ${formatCallTime(result.start, zone())}. Nothing is on your calendar until they accept.${tail}`
  }
  if (suggesting) {
    return "That time is no longer open. Pick another one."
  }
  return "This time is no longer free, so nothing was added to your calendar. You can still decline it, or suggest another time."
}

export default function BookingPage() {
  const { token = "" } = useParams()
  const [loaded, setLoaded] = useState<BookingResponse | "loading" | "failed">(
    "loading",
  )
  const [result, setResult] = useState<BookingResponse | null>(null)
  const [pressing, setPressing] = useState(false)
  const [pressFailed, setPressFailed] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [times, setTimes] = useState<string[] | "loading">("loading")
  const [time, setTime] = useState("")
  const [note, setNote] = useState("")

  useEffect(() => {
    void call(token).then((response) => setLoaded(response ?? "failed"))
  }, [token])

  async function press(action: BookingAction) {
    setPressing(true)
    setPressFailed(false)
    const response = await call(token, action)
    setPressing(false)
    if (!response) setPressFailed(true)
    else setResult(response.state === "open" ? null : response)
    if (response?.state === "used") setLoaded(response)
    if (response?.state === "taken" && action.suggest) {
      setTime("")
      void loadAvailability().then((a) => setTimes(a?.times ?? []))
    }
  }

  function startSuggesting() {
    setSuggesting(true)
    setResult(null)
    void loadAvailability().then((a) => setTimes(a?.times ?? []))
  }

  const noteField = (label: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="booking-note" className="text-sm font-semibold">
        {label}
      </label>
      <textarea
        id="booking-note"
        rows={3}
        maxLength={BOOKING_NOTE_MAX}
        value={note}
        className={cn(inputClass, "resize-y")}
        onChange={(event) => setNote(event.target.value)}
      />
    </div>
  )

  let body: ReactNode
  if (loaded === "failed") {
    body = <p role="alert">{RETRY}</p>
  } else if (loaded === "loading") {
    body = <p aria-live="polite">Loading…</p>
  } else if (loaded.state !== "open") {
    body = (
      <h2 className="text-primary text-2xl font-light">
        This link has already been used
      </h2>
    )
  } else if (result && result.state !== "taken") {
    body = (
      <p role="status" className="font-semibold">
        {resultText(result, loaded.name, suggesting)}
      </p>
    )
  } else {
    const confirm = loaded.action === "confirm"
    const asked = (
      <p>
        {loaded.name} asked for a {loaded.minutes}-minute call on{" "}
        {formatCallTime(loaded.start, zone())}.
      </p>
    )
    const status = (
      <>
        {result && (
          <p role="status" className="font-semibold">
            {resultText(result, loaded.name, suggesting)}
          </p>
        )}
        {pressFailed && <p role="alert">{RETRY}</p>}
      </>
    )
    body = suggesting ? (
      <>
        <h2 className="text-primary text-2xl font-light">
          Suggest another time
        </h2>
        {asked}
        {times === "loading" ? (
          <p aria-live="polite">Loading your open times…</p>
        ) : times.length === 0 ? (
          <p>You have no open times in the next two weeks.</p>
        ) : (
          <TimePicker times={times} value={time} onPick={setTime} />
        )}
        {noteField(`A note for ${loaded.name} (optional)`)}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={pressing || !time}
            onClick={() => press({ suggest: time, note })}
          >
            {pressing ? "Working…" : "Send this suggestion"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pressing}
            onClick={() => {
              setSuggesting(false)
              setResult(null)
            }}
          >
            Back
          </Button>
        </div>
        {status}
      </>
    ) : (
      <>
        <h2 className="text-primary text-2xl font-light">
          {confirm ? "Confirm this call?" : "Decline this call?"}
        </h2>
        {asked}
        {!confirm && noteField(`A note for ${loaded.name} (optional)`)}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={pressing}
            onClick={() => press(confirm ? {} : { note })}
            variant={confirm ? "default" : "outline"}
          >
            {pressing
              ? "Working…"
              : confirm
                ? "Confirm this call"
                : "Decline this call"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pressing}
            onClick={startSuggesting}
          >
            Suggest another time
          </Button>
        </div>
        {status}
      </>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="container flex max-w-xl flex-1 flex-col justify-center gap-4 py-16">
        {body}
        <p>
          <SiteLink className="text-primary underline" href="/">
            Back to the home page
          </SiteLink>
        </p>
      </main>
      <Footer />
    </div>
  )
}
