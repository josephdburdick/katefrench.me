import { type Calendar, localCalendar } from "./calendar"
import type { ContactServices } from "./contact"
import { cloudflareEmail, localEmail } from "./email"
import type { Env } from "./env"
import { googleCalendar } from "./google-calendar"
import { localTurnstile, siteverify } from "./turnstile"

const local: ContactServices = {
  email: localEmail(),
  turnstile: localTurnstile(),
  calendar: localCalendar(),
}

let google: { key: string; calendar: Calendar } | null = null

function googleFor(env: Env): Calendar | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim()
  const refreshToken = env.GOOGLE_REFRESH_TOKEN?.trim()
  if (!clientId || !clientSecret || !refreshToken) return null
  const busyCalendars = (env.GOOGLE_BUSY_CALENDARS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
  const key = JSON.stringify([
    clientId,
    clientSecret,
    refreshToken,
    busyCalendars,
  ])
  if (google?.key !== key) {
    google = {
      key,
      calendar: googleCalendar({
        clientId,
        clientSecret,
        refreshToken,
        busyCalendars,
      }),
    }
  }
  return google.calendar
}

export function servicesFor(env: Env): ContactServices {
  if (env.LOCAL_SERVICES === "1") return local
  return {
    email: cloudflareEmail(env.EMAIL),
    turnstile: siteverify(env.TURNSTILE_SECRET),
    calendar: googleFor(env),
  }
}
