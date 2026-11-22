export type Intent = "hiring" | "venue" | "content" | "other"

/** The homepage sections that link to `/contact`, sent back as `from`. */
export const SOURCES = ["numbers", "new-york", "message", "venues"] as const
export type Source = (typeof SOURCES)[number]

/** The order a visitor sees the steps in. Steps a visitor doesn't need are left out by `stepsFor`. */
export const STEP_ORDER = [
  "intent",
  "details",
  "message",
  "call",
  "reply",
] as const
export type StepId = (typeof STEP_ORDER)[number]

export type Answers = {
  intent: Intent | null
  details: Record<string, string>
  message: string
  name: string
  email: string
  company: string
  /** `""` until answered, `NO_CALL`, or an ISO UTC start time. */
  time: string
}

export const NO_CALL = "none"
export const NO_CALL_LABEL = "No call, just email me"

export type Field =
  "intent" | "details" | "message" | "time" | "name" | "email" | "company"
export type Errors = Partial<Record<Field, string>>

export type DetailGroup = {
  key: string
  question: string
  options: string[]
}

export type IntentOption = {
  value: Intent
  label: string
  short: string
  groups: DetailGroup[]
  subjectKeys: string[]
  prompt: string
}

export const INTENTS: IntentOption[] = [
  {
    value: "hiring",
    label: "I'm hiring for a role",
    short: "Hiring",
    groups: [
      {
        key: "role",
        question: "What kind of role?",
        options: ["Sales", "Partnerships", "Marketing", "Operations"],
      },
      {
        key: "location",
        question: "Where is it based?",
        options: ["New York", "Hybrid", "Remote"],
      },
      {
        key: "start",
        question: "When does it start?",
        options: ["Right away", "In 1 to 3 months", "Just exploring"],
      },
    ],
    subjectKeys: ["role", "location"],
    prompt: "What is the role, and what would I own in it?",
  },
  {
    value: "venue",
    label: "I run a venue or put on events",
    short: "Venue or events",
    groups: [
      {
        key: "kind",
        question: "What do you run?",
        options: ["A venue", "Events or a series", "A festival"],
      },
      {
        key: "next",
        question: "When is your next show?",
        options: ["This month", "In 1 to 3 months", "Not scheduled yet"],
      },
    ],
    subjectKeys: ["kind"],
    prompt: "What do you put on, and what do you sell tickets with today?",
  },
  {
    value: "content",
    label: "I'd like to work together on content",
    short: "Content",
    groups: [
      {
        key: "idea",
        question: "What do you have in mind?",
        options: [
          "A neighborhood guide",
          "A feature on my business",
          "Something else",
        ],
      },
    ],
    subjectKeys: ["idea"],
    prompt: "What is the business or the idea?",
  },
  {
    value: "other",
    label: "Something else",
    short: "Something else",
    groups: [],
    subjectKeys: [],
    prompt: "What's on your mind?",
  },
]

export const STEP_HEADINGS: Record<StepId, string> = {
  intent: "What brings you here?",
  details: "A few quick details",
  message: "Tell me about it",
  call: "Want to talk it through?",
  reply: "Where should I reply?",
}

export const FIELD_LABELS = {
  name: "Your name",
  email: "Email",
  company: "Company or venue",
}

export const PRIVACY_NOTE =
  "I keep your message so I can reply to you, and I don't do anything else with it."

export const FIELD_STEP: Record<Field, StepId> = {
  intent: "intent",
  details: "details",
  message: "message",
  time: "call",
  name: "reply",
  email: "reply",
  company: "reply",
}

export const LIMITS = {
  message: 5000,
  name: 200,
  email: 254,
  company: 200,
  /** Bytes, not characters: every field at its limit in 4-byte UTF-8, plus a 2,048-character Turnstile token and JSON overhead. */
  body: 49152,
}

/** `website` is a trap field: people never see it, so any value means a bot. */
export type ContactRequest = {
  answers: Answers
  token: string
  website: string
  from: Source | null
}

export type ContactResponse =
  | { ok: true }
  | {
      ok: false
      error: "origin" | "too_large" | "invalid" | "turnstile" | "send"
      fields?: Errors
    }

export type Availability = { times: string[]; minutes: number }

/** `emailed` is false when the email to the visitor didn't go out. */
export type BookingResponse =
  | {
      state: "open"
      action: "confirm" | "decline"
      start: string
      minutes: number
      name: string
      timeZone: string
    }
  | { state: "used" }
  | { state: "taken" }
  | { state: "declined"; emailed: boolean }
  | { state: "confirmed"; start: string; videoLink: string; emailed: boolean }

export const TIME_TAKEN =
  "That time was just taken. Pick another, or choose email only."

export const SENDER = { email: "form@katefrench.me", name: "katefrench.me" }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emptyAnswers(): Answers {
  return {
    intent: null,
    details: {},
    message: "",
    name: "",
    email: "",
    company: "",
    time: "",
  }
}

export function isIntent(value: unknown): value is Intent {
  return INTENTS.some((intent) => intent.value === value)
}

export function isSource(value: unknown): value is Source {
  return SOURCES.some((source) => source === value)
}

export const SOURCE_INTENT: Record<Source, Intent> = {
  numbers: "hiring",
  "new-york": "hiring",
  message: "venue",
  venues: "venue",
}

export function nextStepHref(source: Source): string {
  const params = new URLSearchParams({
    intent: SOURCE_INTENT[source],
    from: source,
  })
  return `/contact?${params}`
}

export function prefillFrom(params: URLSearchParams): {
  intent: Intent | null
  from: Source | null
} {
  const intent = params.get("intent")
  const from = params.get("from")
  return {
    intent: isIntent(intent) ? intent : null,
    from: isSource(from) ? from : null,
  }
}

export function intentOption(intent: Intent): IntentOption {
  return INTENTS.find((option) => option.value === intent)!
}

export function groupsFor(intent: Intent | null): DetailGroup[] {
  return intent ? intentOption(intent).groups : []
}

/** Before an intent is picked, the steps assume one with details, the path most visitors take. */
export function stepsFor(intent: Intent | null): StepId[] {
  const skipDetails = intent !== null && groupsFor(intent).length === 0
  return STEP_ORDER.filter((step) => !(step === "details" && skipDetails))
}

export function stepLabel(index: number, steps: StepId[]): string {
  return `Step ${index + 1} of ${steps.length}`
}

export function withIntent(answers: Answers, intent: Intent): Answers {
  if (answers.intent === intent) return answers
  return { ...answers, intent, details: {} }
}

export function validateStep(step: StepId, answers: Answers): Errors {
  const errors: Errors = {}

  if (step === "intent" && !isIntent(answers.intent)) {
    errors.intent = "Pick the one that fits best."
  }

  if (step === "details") {
    const complete = groupsFor(answers.intent).every((group) =>
      group.options.includes(answers.details[group.key]),
    )
    if (!complete) errors.details = "Pick one answer for each question."
  }

  if (step === "message") {
    if (!answers.message.trim()) {
      errors.message = "Write a sentence or two so I know what this is about."
    } else if (answers.message.length > LIMITS.message) {
      errors.message = "Keep it under 5,000 characters."
    }
  }

  if (step === "call" && answers.time === "") {
    errors.time = "Pick a time, or choose email only."
  }

  if (step === "reply") {
    if (!answers.name.trim()) errors.name = "Add your name."
    else if (answers.name.length > LIMITS.name) {
      errors.name = "Keep your name under 200 characters."
    }
    const email = answers.email.trim()
    if (!EMAIL_RE.test(email) || email.length > LIMITS.email) {
      errors.email = "Add an email I can reply to, like you@company.com."
    }
    if (answers.company.length > LIMITS.company) {
      errors.company = "Keep this under 200 characters."
    }
  }

  return errors
}

export function validateAll(answers: Answers): Errors {
  if (!isIntent(answers.intent)) return validateStep("intent", answers)

  const errors = stepsFor(answers.intent).reduce<Errors>(
    (all, step) => ({ ...all, ...validateStep(step, answers) }),
    {},
  )

  const allowed = groupsFor(answers.intent).map((group) => group.key)
  if (Object.keys(answers.details).some((key) => !allowed.includes(key))) {
    errors.details = "Pick one answer for each question."
  }

  return errors
}

/** The index in `steps` of the first step with an error, or -1. */
export function firstStepWithError(steps: StepId[], errors: Errors): number {
  const fields = Object.keys(errors) as Field[]
  return steps.findIndex((step) =>
    fields.some((field) => FIELD_STEP[field] === step),
  )
}

const str = (value: unknown) => (typeof value === "string" ? value : "")

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function toAnswers(raw: unknown): Answers {
  const input = isObject(raw) ? raw : {}
  const details = isObject(input.details)
    ? Object.fromEntries(
        Object.entries(input.details).map(([key, value]) => [key, str(value)]),
      )
    : {}
  return {
    intent: isIntent(input.intent) ? input.intent : null,
    details,
    message: str(input.message),
    name: str(input.name),
    email: str(input.email),
    company: str(input.company),
    time:
      typeof input.time === "string" && input.time.length <= 40
        ? input.time
        : NO_CALL,
  }
}

export function hasCallTime(answers: Answers): boolean {
  return answers.time !== "" && answers.time !== NO_CALL
}

/** Like "Monday, November 23 at 9:00 AM EST". */
export function formatCallTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
    .format(new Date(iso))
    .replace(/\s/g, " ")
}

export type CallDetails = { timeZone: string; minutes: number }

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim()

export function buildEmail(
  answers: Answers,
  call?: CallDetails,
  links?: { confirm: string; decline: string },
): {
  subject: string
  text: string
  replyTo: { email: string; name: string }
} {
  const option = answers.intent ? intentOption(answers.intent) : undefined
  const name = oneLine(answers.name)

  const subject = [
    `[katefrench.me] ${option?.short ?? "New message"}`,
    ...(option?.subjectKeys ?? []).map((key) => answers.details[key]),
  ]
    .filter(Boolean)
    .join(" · ")

  const pairs: [string, string][] = [
    [STEP_HEADINGS.intent, option?.label ?? ""],
    ...(option?.groups ?? []).map((group): [string, string] => [
      group.question,
      answers.details[group.key] ?? "",
    ]),
    [option?.prompt ?? STEP_HEADINGS.message, answers.message.trim()],
    [
      STEP_HEADINGS.call,
      !hasCallTime(answers)
        ? NO_CALL_LABEL
        : call
          ? `${formatCallTime(answers.time, call.timeZone)}, ${call.minutes} minutes`
          : answers.time,
    ],
    [FIELD_LABELS.name, name],
    [FIELD_LABELS.email, answers.email.trim()],
    [FIELD_LABELS.company, oneLine(answers.company) || "Not given"],
  ]
  const text = [
    ...pairs.map(([question, answer]) => `${question}\n${answer}`),
    ...(links ? [`Confirm: ${links.confirm}\nDecline: ${links.decline}`] : []),
  ].join("\n\n")

  return { subject, text, replyTo: { email: answers.email.trim(), name } }
}
