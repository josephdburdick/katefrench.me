import TimePicker from "@/components/booking/TimePicker"
import { loadAvailability } from "@/components/contact/submit"
import Footer from "@/components/global/Footer"
import Header from "@/components/global/Header"
import { Button } from "@/components/ui/button"
import { type SuggestionResponse, formatCallTime } from "@/lib/contact-form"
import { type ReactNode, useEffect, useState } from "react"
import { useParams } from "react-router"

async function call(token: string, action?: { pick?: string }) {
  try {
    const response = await fetch(
      `/api/booking/time/${encodeURIComponent(token)}`,
      {
        method: action ? "POST" : "GET",
        ...(action && {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action),
        }),
      },
    )
    if (!response.ok) return null
    return (await response.json()) as SuggestionResponse
  } catch {
    return null
  }
}

const RETRY = "Something went wrong. Check your connection, then try again."

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export default function SuggestionPage() {
  const { token = "" } = useParams()
  const [loaded, setLoaded] = useState<
    SuggestionResponse | "loading" | "failed"
  >("loading")
  const [result, setResult] = useState<SuggestionResponse | null>(null)
  const [pressing, setPressing] = useState(false)
  const [pressFailed, setPressFailed] = useState(false)
  const [picking, setPicking] = useState(false)
  const [times, setTimes] = useState<string[] | "loading">("loading")
  const [time, setTime] = useState("")

  useEffect(() => {
    void call(token).then((response) => setLoaded(response ?? "failed"))
  }, [token])

  function startPicking() {
    setPicking(true)
    setResult(null)
    setTime("")
    setTimes("loading")
    void loadAvailability().then((a) => setTimes(a?.times ?? []))
  }

  async function press(action: { pick?: string }) {
    setPressing(true)
    setPressFailed(false)
    const response = await call(token, action)
    setPressing(false)
    if (!response) {
      setPressFailed(true)
      return
    }
    if (response.state === "used") setLoaded(response)
    else if (response.state === "taken") {
      setResult(response)
      startPicking()
      setResult(response)
    } else if (response.state !== "open") setResult(response)
  }

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
  } else if (result?.state === "confirmed") {
    body = (
      <div role="status" className="flex flex-col gap-3">
        <h2 className="text-primary text-2xl font-light">
          Your call is confirmed
        </h2>
        <p>
          {formatCallTime(result.start, zone())}, {loaded.minutes} minutes, by
          video.
        </p>
        <p>
          <a className="text-primary underline" href={result.videoLink}>
            {result.videoLink}
          </a>
        </p>
        <p>
          {result.emailed
            ? "The link is in your email too."
            : "The email with this link didn't go out, so keep this page or copy the link."}
        </p>
      </div>
    )
  } else if (result?.state === "requested") {
    body = (
      <p role="status" className="font-semibold">
        Sent. Kate will confirm {formatCallTime(result.start, zone())} by email.
        {result.emailed
          ? ""
          : " Her notice didn't go out, so reply to her email to let her know."}
      </p>
    )
  } else {
    const taken = result?.state === "taken"
    body = picking ? (
      <>
        <h2 className="text-primary text-2xl font-light">Pick another time</h2>
        {taken && (
          <p role="status" className="font-semibold">
            That time was just taken. Pick another one.
          </p>
        )}
        {times === "loading" ? (
          <p aria-live="polite">Loading open times…</p>
        ) : times.length === 0 ? (
          <p>
            There are no open times right now. Reply to Kate&rsquo;s email and
            she will find one with you.
          </p>
        ) : (
          <TimePicker times={times} value={time} onPick={setTime} />
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={pressing || !time}
            onClick={() => press({ pick: time })}
          >
            {pressing ? "Working…" : "Ask for this time"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pressing}
            onClick={() => {
              setPicking(false)
              setResult(null)
            }}
          >
            Back
          </Button>
        </div>
        {pressFailed && <p role="alert">{RETRY}</p>}
      </>
    ) : (
      <>
        <h2 className="text-primary text-2xl font-light">
          Kate suggested another time
        </h2>
        <p>
          Hi {loaded.name}. Kate can do a {loaded.minutes}-minute video call on{" "}
          <strong>{formatCallTime(loaded.start, zone())}</strong>.
        </p>
        {loaded.note && (
          <figure className="border-primary border-l-4 pl-4">
            <blockquote className="whitespace-pre-line">
              {loaded.note}
            </blockquote>
            <figcaption className="text-foreground/70 mt-1 text-sm">
              Kate
            </figcaption>
          </figure>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={pressing} onClick={() => press({})}>
            {pressing ? "Working…" : "Accept this time"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pressing}
            onClick={startPicking}
          >
            Pick another time
          </Button>
        </div>
        {pressFailed && <p role="alert">{RETRY}</p>}
      </>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="container flex max-w-xl flex-1 flex-col justify-center gap-4 py-16">
        {body}
        <p>
          <a className="text-primary underline" href="/">
            Back to the home page
          </a>
        </p>
      </main>
      <Footer />
    </div>
  )
}
