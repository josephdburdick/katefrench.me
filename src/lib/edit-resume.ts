import type { EditErrors } from "./edit-content"

export const RESUME_LIMITS = {
  sections: 12,
  entries: 20,
  details: 12,
  /** Characters of a section title, an entry title or an entry's place. */
  line: 120,
  /** Characters of a text section's paragraph. */
  text: 2000,
  /** Characters of one point under an entry. */
  detail: 500,
  minYear: 1950,
  maxYear: 2100,
}

export type ResumeEntry = {
  title: string
  /** A city, an employer or a school. May be empty. */
  place: string
  start: number
  /** `null` means the entry is still current. */
  end: number | null
  details: string[]
}

export type ResumeSection =
  | { kind: "text"; title: string; text: string }
  | { kind: "list"; title: string; entries: ResumeEntry[] }

/** `GET /api/edit/:token/resume` and the body of `PUT`. */
export type ResumeContent = { sections: ResumeSection[] }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const text = (value: unknown) => (typeof value === "string" ? value : "")

const year = (value: unknown) => {
  const parsed = new Date(text(value)).getUTCFullYear()
  return Number.isFinite(parsed) ? parsed : new Date().getUTCFullYear()
}

/** The stored `cv` attributes as the sections the edit screen works with. */
export function resumeFromStored(attributes: unknown): ResumeContent {
  const stored = isObject(attributes) ? attributes.sections : undefined
  const sections = (Array.isArray(stored) ? stored : []).filter(isObject)
  return {
    sections: sections.map((section): ResumeSection => {
      if (!Array.isArray(section.items)) {
        return {
          kind: "text",
          title: text(section.title),
          text: text(section.content).trim(),
        }
      }
      return {
        kind: "list",
        title: text(section.title),
        entries: section.items.filter(isObject).map((item) => {
          const date = isObject(item.date) ? item.date : {}
          const details = Array.isArray(item.details)
            ? item.details.filter((d) => typeof d === "string")
            : text(item.details)
              ? [text(item.details)]
              : []
          return {
            title: text(item.role) || text(item.degree),
            place: text(item.location) || text(item.institution),
            start: year(date.start),
            end: date.end ? year(date.end) : null,
            details,
          }
        }),
      }
    }),
  }
}

/** The `sections` to store for a request that passed `validateResume`. */
export function resumeToStored({ sections }: ResumeContent) {
  return sections.map((section) => {
    const title = section.title.trim()
    if (section.kind === "text") {
      return { title, content: section.text.trim() }
    }
    return {
      title,
      items: section.entries.map((entry) => {
        const place = entry.place.trim()
        const details = entry.details.map((d) => d.trim()).filter(Boolean)
        return {
          role: entry.title.trim(),
          date: {
            start: `${entry.start}-01-01T00:00:00.000Z`,
            end: entry.end === null ? null : `${entry.end}-12-31T00:00:00.000Z`,
          },
          ...(place ? { location: place } : {}),
          ...(details.length > 0 ? { details } : {}),
        }
      }),
    }
  })
}

function checkLine(
  value: unknown,
  max: number,
  required: boolean,
): string | undefined {
  if (typeof value !== "string") return "Enter some text."
  const trimmed = value.trim()
  if (required && !trimmed) return "This can't be empty."
  if (trimmed.length > max) return `Keep this under ${max} characters.`
  return undefined
}

const isYear = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= RESUME_LIMITS.minYear &&
  value <= RESUME_LIMITS.maxYear

const YEAR_MESSAGE = `Enter a year from ${RESUME_LIMITS.minYear} to ${RESUME_LIMITS.maxYear}.`

function checkEntry(entry: unknown, at: string, errors: EditErrors) {
  if (
    !isObject(entry) ||
    Object.keys(entry).some(
      (key) => !["title", "place", "start", "end", "details"].includes(key),
    )
  ) {
    errors[at] = "This entry isn't in a form that can be saved."
    return
  }
  const title = checkLine(entry.title, RESUME_LIMITS.line, true)
  if (title) errors[`${at}.title`] = title
  const place = checkLine(entry.place, RESUME_LIMITS.line, false)
  if (place) errors[`${at}.place`] = place
  if (!isYear(entry.start)) errors[`${at}.start`] = YEAR_MESSAGE
  if (entry.end !== null) {
    if (!isYear(entry.end)) errors[`${at}.end`] = YEAR_MESSAGE
    else if (isYear(entry.start) && entry.end < entry.start) {
      errors[`${at}.end`] = "The end year can't be before the start year."
    }
  }
  const { details } = entry
  if (!Array.isArray(details) || details.length > RESUME_LIMITS.details) {
    errors[`${at}.details`] =
      `Keep this to ${RESUME_LIMITS.details} points or fewer.`
  } else if (
    details.some((d) => checkLine(d, RESUME_LIMITS.detail, false) !== undefined)
  ) {
    errors[`${at}.details`] =
      `Keep each point under ${RESUME_LIMITS.detail} characters.`
  }
}

/** Checks a `PUT /resume` body. Error keys read like `sections.1.entries.0.title`. */
export function validateResume(body: Record<string, unknown>): EditErrors {
  const errors: EditErrors = {}
  for (const key of Object.keys(body)) {
    if (key !== "sections") errors[key] = "This isn't an editable field."
  }
  const { sections } = body
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.sections = "Keep at least one section."
    return errors
  }
  if (sections.length > RESUME_LIMITS.sections) {
    errors.sections = `Keep this to ${RESUME_LIMITS.sections} sections or fewer.`
    return errors
  }
  sections.forEach((section: unknown, i) => {
    const at = `sections.${i}`
    const allowed =
      isObject(section) && section.kind === "list"
        ? ["kind", "title", "entries"]
        : ["kind", "title", "text"]
    if (
      !isObject(section) ||
      (section.kind !== "text" && section.kind !== "list") ||
      Object.keys(section).some((key) => !allowed.includes(key))
    ) {
      errors[at] = "This section isn't in a form that can be saved."
      return
    }
    const title = checkLine(section.title, RESUME_LIMITS.line, true)
    if (title) errors[`${at}.title`] = title
    if (section.kind === "text") {
      const paragraph = checkLine(section.text, RESUME_LIMITS.text, true)
      if (paragraph) errors[`${at}.text`] = paragraph
      return
    }
    const { entries } = section
    if (!Array.isArray(entries) || entries.length > RESUME_LIMITS.entries) {
      errors[`${at}.entries`] =
        `Keep this to ${RESUME_LIMITS.entries} entries or fewer.`
      return
    }
    entries.forEach((entry: unknown, j) =>
      checkEntry(entry, `${at}.entries.${j}`, errors),
    )
  })
  return errors
}
