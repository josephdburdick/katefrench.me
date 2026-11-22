import type { Calendar, Interval } from "./calendar"

export type GoogleCredentials = {
  clientId: string
  clientSecret: string
  refreshToken: string
}

/** The only scopes the refresh token may carry: busy times and event inserts. */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
] as const

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy"
const EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all"
const REFRESH_MARGIN = 60_000

type Step = "google-token" | "google-freebusy" | "google-event"

class GoogleError extends Error {
  constructor(
    readonly code: Step,
    detail: string,
  ) {
    super(`${code}: ${detail}`)
    this.name = "GoogleError"
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

async function call(
  step: Step,
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch {
    throw new GoogleError(step, "request failed")
  }
  if (!response.ok) throw new GoogleError(step, `status ${response.status}`)
  try {
    return await response.json()
  } catch {
    throw new GoogleError(step, "invalid JSON")
  }
}

export function googleCalendar(
  credentials: GoogleCredentials,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Calendar {
  let cached: { token: string; refreshAt: number } | null = null

  async function accessToken(): Promise<string> {
    if (cached && now() < cached.refreshAt) return cached.token
    const body = await call("google-token", fetchImpl, TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: credentials.refreshToken,
      }),
    })
    if (
      !isRecord(body) ||
      typeof body.access_token !== "string" ||
      body.access_token === "" ||
      typeof body.expires_in !== "number" ||
      !(body.expires_in > 0)
    ) {
      throw new GoogleError("google-token", "unexpected response")
    }
    cached = {
      token: body.access_token,
      refreshAt: now() + body.expires_in * 1000 - REFRESH_MARGIN,
    }
    return cached.token
  }

  async function post(step: Step, url: string, payload: unknown) {
    const token = await accessToken()
    return call(step, fetchImpl, url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
  }

  return {
    async busy(from, to) {
      const body = await post("google-freebusy", FREEBUSY_URL, {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        items: [{ id: "primary" }],
      })
      const primary =
        isRecord(body) && isRecord(body.calendars)
          ? body.calendars.primary
          : undefined
      if (!isRecord(primary)) {
        throw new GoogleError("google-freebusy", "no primary calendar")
      }
      if (Array.isArray(primary.errors) && primary.errors.length > 0) {
        throw new GoogleError("google-freebusy", "calendar errors")
      }
      if (!Array.isArray(primary.busy)) {
        throw new GoogleError("google-freebusy", "unexpected response")
      }
      const intervals: Interval[] = primary.busy.map((interval: unknown) => {
        const start = isRecord(interval)
          ? Date.parse(String(interval.start))
          : NaN
        const end = isRecord(interval) ? Date.parse(String(interval.end)) : NaN
        if (Number.isNaN(start) || Number.isNaN(end)) {
          throw new GoogleError("google-freebusy", "invalid interval")
        }
        return {
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
        }
      })
      return intervals
        .filter(
          (interval) =>
            Date.parse(interval.end) > from.getTime() &&
            Date.parse(interval.start) < to.getTime(),
        )
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    },
    async createEvent(event) {
      const body = await post("google-event", EVENTS_URL, {
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.start },
        end: { dateTime: event.end },
        attendees: [
          { email: event.guest.email, displayName: event.guest.name },
        ],
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      })
      const videoLink = isRecord(body) ? meetLink(body) : undefined
      if (typeof videoLink !== "string" || !videoLink.startsWith("https://")) {
        throw new GoogleError("google-event", "no video link")
      }
      return { videoLink }
    },
  }
}

function meetLink(body: Record<string, unknown>): unknown {
  if (body.hangoutLink !== undefined) return body.hangoutLink
  const entryPoints = isRecord(body.conferenceData)
    ? body.conferenceData.entryPoints
    : undefined
  if (!Array.isArray(entryPoints)) return undefined
  const video = entryPoints.find(
    (entry: unknown) => isRecord(entry) && entry.entryPointType === "video",
  ) as Record<string, unknown> | undefined
  return video?.uri
}
