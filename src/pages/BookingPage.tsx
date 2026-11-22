import Footer from "@/components/global/Footer"
import Header from "@/components/global/Header"
import { Button } from "@/components/ui/button"
import { type BookingResponse, formatCallTime } from "@/lib/contact-form"
import { type ReactNode, useEffect, useState } from "react"
import { useParams } from "react-router"

async function call(token: string, method: "GET" | "POST") {
  try {
    const response = await fetch(`/api/booking/${encodeURIComponent(token)}`, {
      method,
    })
    if (!response.ok) return null
    return (await response.json()) as BookingResponse
  } catch {
    return null
  }
}

const RETRY = "Something went wrong. Check your connection, then try again."

function resultText(result: BookingResponse, name: string): string {
  const notEmailed = `The email to ${name} didn't go out, so please write to them yourself.`
  if (result.state === "confirmed") {
    return `Confirmed. ${name} has the video link by email.${result.emailed ? "" : ` ${notEmailed}`}`
  }
  if (result.state === "declined") {
    return `Declined. ${name} will get a note that you'll reply by email.${result.emailed ? "" : ` ${notEmailed}`}`
  }
  return "This time is no longer free, so nothing was added to your calendar. You can still decline it from the email."
}

export default function BookingPage() {
  const { token = "" } = useParams()
  const [loaded, setLoaded] = useState<BookingResponse | "loading" | "failed">(
    "loading",
  )
  const [result, setResult] = useState<BookingResponse | null>(null)
  const [pressing, setPressing] = useState(false)
  const [pressFailed, setPressFailed] = useState(false)

  useEffect(() => {
    void call(token, "GET").then((response) => setLoaded(response ?? "failed"))
  }, [token])

  async function press() {
    setPressing(true)
    setPressFailed(false)
    const response = await call(token, "POST")
    setPressing(false)
    if (!response) setPressFailed(true)
    else setResult(response.state === "open" ? null : response)
    if (response?.state === "used") setLoaded(response)
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
  } else if (result) {
    body = (
      <p role="status" className="font-semibold">
        {resultText(result, loaded.name)}
      </p>
    )
  } else {
    const confirm = loaded.action === "confirm"
    body = (
      <>
        <h2 className="text-primary text-2xl font-light">
          {confirm ? "Confirm this call?" : "Decline this call?"}
        </h2>
        <p>
          {loaded.name} asked for a {loaded.minutes}-minute call on{" "}
          {formatCallTime(
            loaded.start,
            Intl.DateTimeFormat().resolvedOptions().timeZone,
          )}
          .
        </p>
        <Button
          type="button"
          disabled={pressing}
          onClick={press}
          variant={confirm ? "default" : "outline"}
        >
          {pressing
            ? "Working…"
            : confirm
              ? "Confirm this call"
              : "Decline this call"}
        </Button>
        {pressFailed && <p role="alert">{RETRY}</p>}
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="container max-w-xl space-y-4 py-16">
        {body}
        <p>
          <a className="text-primary underline" href="/">
            Back to the home page
          </a>
        </p>
      </div>
      <Footer />
    </>
  )
}
