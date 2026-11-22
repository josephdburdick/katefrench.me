import type { Intent } from "./contact-form"
import {
  EDIT_LIMITS,
  type EditErrors,
  isSectionKey,
  sectionTitle,
} from "./edit-content"

/** In the order the screens list them. The `leads.status` CHECK holds the same five. */
export const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "replied", label: "Replied" },
  { value: "call-booked", label: "Call booked" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]["value"]

export const LEAD_STATUS_VALUES: LeadStatus[] = LEAD_STATUSES.map(
  ({ value }) => value,
)

export const isLeadStatus = (value: unknown): value is LeadStatus =>
  LEAD_STATUS_VALUES.includes(value as LeadStatus)

export const leadStatusLabel = (status: LeadStatus) =>
  LEAD_STATUSES.find(({ value }) => value === status)!.label

export const LEAD_LIMITS = {
  /** Characters of Kate's private notes on one lead. */
  notes: 5000,
  /** Bytes of a `PUT` body, as for the other edit saves. */
  body: EDIT_LIMITS.body,
}

export type LeadSummary = {
  /** Leads since the calendar month began in New York. */
  thisMonth: number
  byStatus: Record<LeadStatus, number>
}

export type LeadListItem = {
  id: string
  /** ISO UTC. */
  createdAt: string
  intent: Intent
  name: string
  company: string | null
  /** The homepage section the visitor came from, or null when they came to `/contact` directly. */
  fromSection: string | null
  status: LeadStatus
}

/** `GET /api/edit/:token/leads`. */
export type LeadsResponse = { summary: LeadSummary; leads: LeadListItem[] }

/** `GET /api/edit/:token/leads/:id`. */
export type LeadDetail = LeadListItem & {
  email: string
  answers: { details: Record<string, string>; message: string }
  notes: string
}

export type LeadUpdate = { status: LeadStatus; notes: string }

/** Checks a `PUT /leads/:id` body. Only `status` and `notes` may be sent, and both must be. */
export function validateLeadUpdate(body: Record<string, unknown>): EditErrors {
  const errors: EditErrors = {}
  for (const key of Object.keys(body)) {
    if (key !== "status" && key !== "notes") {
      errors[key] = "This isn't an editable field."
    }
  }
  if (!isLeadStatus(body.status)) errors.status = "Pick a status."
  if (typeof body.notes !== "string") errors.notes = "Enter some text."
  else if (body.notes.length > LEAD_LIMITS.notes) {
    errors.notes = `Keep this to ${LEAD_LIMITS.notes.toLocaleString("en-US")} characters or fewer.`
  }
  return errors
}

export const LEADS_TIME_ZONE = "America/New_York"

function zonedParts(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: LEADS_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, Number(value)]),
  )
  return parts as Record<
    "year" | "month" | "day" | "hour" | "minute" | "second",
    number
  >
}

/** Milliseconds New York's wall clock is ahead of UTC at `date`. Negative. */
function offsetAt(date: Date) {
  const p = zonedParts(date)
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wall - Math.floor(date.getTime() / 1000) * 1000
}

/** The ISO UTC instant when `now`'s calendar month began in New York. */
export function monthStart(now: Date): string {
  const { year, month } = zonedParts(now)
  const midnight = Date.UTC(year, month - 1, 1)
  let start = midnight - offsetAt(new Date(midnight))
  start = midnight - offsetAt(new Date(start))
  return new Date(start).toISOString()
}

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: LEADS_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
})

/** Such as "Nov 21, 2026, 3:04 PM EST". */
export const formatLeadTime = (iso: string) => timeFormat.format(new Date(iso))

/** The homepage section's title, or "Direct" when the visitor didn't come from one. */
export function sourceLabel(fromSection: string | null) {
  if (!fromSection) return "Direct"
  return isSectionKey(fromSection) ? sectionTitle(fromSection) : fromSection
}
