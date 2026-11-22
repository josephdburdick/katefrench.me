import type { NumberItem, NumberKind } from "./numbers"

/** The homepage sections Kate can edit, in page order. */
export const EDIT_SECTIONS = [
  { key: "numbers", title: "Numbers" },
  { key: "new-york", title: "New York, from zero" },
  { key: "message", title: "The message that worked" },
  { key: "first-call", title: "The first call" },
  { key: "marketing", title: "More than the sales call" },
  { key: "venues", title: "Why venues pick up" },
  { key: "closing", title: "Closing" },
] as const

export type SectionKey = (typeof EDIT_SECTIONS)[number]["key"]

export const SECTION_KEYS: SectionKey[] = EDIT_SECTIONS.map(({ key }) => key)

export const isSectionKey = (value: unknown): value is SectionKey =>
  SECTION_KEYS.includes(value as SectionKey)

export const sectionTitle = (key: SectionKey) =>
  EDIT_SECTIONS.find((section) => section.key === key)!.title

export const EDIT_LIMITS = {
  /** Bytes, checked against both `Content-Length` and the bytes read. */
  body: 32 * 1024,
  /** Characters of a section's Markdown body. */
  markdown: 5000,
  /** Characters of one text field in a section's attributes. */
  text: 500,
  /** Characters of one number's label. */
  numberLabel: 120,
}

/** Inclusive ranges for a number's `value`. `step` is the smallest change, so ratios and percents are whole numbers. */
export const NUMBER_RANGES: Record<
  NumberKind,
  { min: number; max: number; step: number }
> = {
  ratio: { min: 1, max: 100, step: 1 },
  percent: { min: 0, max: 100, step: 1 },
  multiple: { min: 1, max: 100, step: 0.1 },
}

/** Attribute paths that must keep their stored value. `[]` stands for any array index. */
export const LOCKED_PATHS = [
  "numbers.items[].id",
  "numbers.items[].kind",
  "new-york.city.buttons[].number",
  "venues.roles[].photo.src",
  "closing.contact.url",
]

export type Path = (string | number)[]

export type EditErrors = Record<string, string>

export type EditEntry = {
  attributes: any
  body: string
  draft: boolean
  updatedAt: string
}

/** `GET /api/edit/:token/content`. */
export type EditContent = Partial<Record<SectionKey, EditEntry>>

export type NumbersRequest = {
  label: string
  items: { id: string; value: number; label: string }[]
  draft: boolean
}

export type SectionRequest = {
  body: string
  attributes: unknown
  draft: boolean
}

export type SaveResponse =
  | { ok: true; updatedAt: string }
  | { error: "invalid"; fields?: EditErrors }
  | { error: "too_large" | "not found" | "save failed" }

/** The key a field's error is reported under, such as `items.0.value` or `attributes.city.label`. */
export const fieldKey = (path: Path) => path.join(".")

/** `["city", "buttons", 0, "number"]` becomes `city.buttons[].number`. */
export function pathPattern(path: Path) {
  return path.reduce<string>((pattern, segment) => {
    if (typeof segment === "number") return `${pattern}[]`
    return pattern ? `${pattern}.${segment}` : segment
  }, "")
}

export const isLocked = (key: SectionKey, path: Path) =>
  LOCKED_PATHS.includes(`${key}.${pathPattern(path)}`)

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const LOCKED_MESSAGE = "This can't be changed here."

function rejectUnknownKeys(
  body: Record<string, unknown>,
  allowed: string[],
  errors: EditErrors,
) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) errors[key] = "This isn't an editable field."
  }
}

function checkDraft(value: unknown, errors: EditErrors) {
  if (typeof value !== "boolean") errors.draft = "Choose draft or not."
}

/** An error message for `value` as a number of `kind`, or undefined when it fits the range. */
export function validateNumberValue(
  kind: NumberKind,
  value: unknown,
): string | undefined {
  const { min, max } = NUMBER_RANGES[kind]
  const range = `from ${min} to ${max}`
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `Enter a number ${range}.`
  }
  if (kind === "multiple") {
    const tenths = value * 10
    if (
      value < min ||
      value > max ||
      Math.abs(tenths - Math.round(tenths)) > 1e-9
    ) {
      return `Enter a number ${range}, with at most one decimal place.`
    }
    return undefined
  }
  if (value < min || value > max || !Number.isInteger(value)) {
    return `Enter a whole number ${range}.`
  }
  return undefined
}

function checkText(
  value: unknown,
  max: number,
  required: boolean,
): string | undefined {
  if (typeof value !== "string") return "Enter some text."
  const text = value.trim()
  if (required && !text) return "This can't be empty."
  if (text.length > max) return `Keep this under ${max} characters.`
  return undefined
}

/** Checks a `PUT /numbers` body against the stored `numbers` attributes. */
export function validateNumbers(
  body: Record<string, unknown>,
  stored: { items: NumberItem[] },
): EditErrors {
  const errors: EditErrors = {}
  rejectUnknownKeys(body, ["label", "items", "draft"], errors)
  checkDraft(body.draft, errors)

  const label = checkText(body.label, EDIT_LIMITS.text, true)
  if (label) errors.label = label

  const { items } = body
  if (!Array.isArray(items) || items.length !== stored.items.length) {
    errors.items = "Keep the same numbers, in the same order."
    return errors
  }
  items.forEach((item: unknown, i) => {
    const expected = stored.items[i]
    if (
      !isObject(item) ||
      Object.keys(item).some((key) => !["id", "value", "label"].includes(key))
    ) {
      errors[`items.${i}`] = "Only the value and label can change."
      return
    }
    if (item.id !== expected.id) errors[`items.${i}.id`] = LOCKED_MESSAGE
    const value = validateNumberValue(expected.kind, item.value)
    if (value) errors[`items.${i}.value`] = value
    const itemLabel = checkText(item.label, EDIT_LIMITS.numberLabel, true)
    if (itemLabel) errors[`items.${i}.label`] = itemLabel
  })
  return errors
}

/** The `numbers` attributes to store for a request that passed `validateNumbers`. */
export function numbersAttributes(
  request: NumbersRequest,
  stored: { items: NumberItem[] } & Record<string, unknown>,
) {
  return {
    ...stored,
    label: request.label.trim(),
    items: stored.items.map((item, i) => ({
      ...item,
      value: request.items[i].value,
      label: request.items[i].label.trim(),
    })),
  }
}

function checkShape(
  key: SectionKey,
  stored: unknown,
  input: unknown,
  path: Path,
  errors: EditErrors,
) {
  const field = fieldKey(["attributes", ...path])
  if (Array.isArray(stored)) {
    if (!Array.isArray(input) || input.length !== stored.length) {
      errors[field] = "Keep the same number of items."
      return
    }
    stored.forEach((value, i) =>
      checkShape(key, value, input[i], [...path, i], errors),
    )
    return
  }
  if (isObject(stored)) {
    const keys = Object.keys(stored)
    if (
      !isObject(input) ||
      Object.keys(input).length !== keys.length ||
      keys.some((k) => !Object.hasOwn(input, k))
    ) {
      errors[field] = "Keep the same fields."
      return
    }
    for (const k of keys)
      checkShape(key, stored[k], input[k], [...path, k], errors)
    return
  }
  if (typeof stored === "string") {
    if (typeof input !== "string") errors[field] = "Enter some text."
    else if (isLocked(key, path) && input !== stored)
      errors[field] = LOCKED_MESSAGE
    else if (input.length > EDIT_LIMITS.text) {
      errors[field] = `Keep this under ${EDIT_LIMITS.text} characters.`
    }
    return
  }
  if (input !== stored) errors[field] = LOCKED_MESSAGE
}

/** Checks a `PUT /sections/:key` body against the stored attributes. Only text may change. */
export function validateSection(
  key: SectionKey,
  body: Record<string, unknown>,
  stored: { attributes: unknown },
): EditErrors {
  const errors: EditErrors = {}
  rejectUnknownKeys(body, ["body", "attributes", "draft"], errors)
  checkDraft(body.draft, errors)
  if (typeof body.body !== "string") errors.body = "Enter some text."
  else if (body.body.length > EDIT_LIMITS.markdown) {
    errors.body = `Keep this under ${EDIT_LIMITS.markdown.toLocaleString("en-US")} characters.`
  }
  checkShape(key, stored.attributes, body.attributes, [], errors)
  return errors
}

/** Every text field of `attributes` that Kate may change, in order, with its path. */
export function editableLeaves(
  key: SectionKey,
  attributes: unknown,
  path: Path = [],
): { path: Path; value: string }[] {
  if (Array.isArray(attributes)) {
    return attributes.flatMap((value, i) =>
      editableLeaves(key, value, [...path, i]),
    )
  }
  if (isObject(attributes)) {
    return Object.entries(attributes).flatMap(([k, value]) =>
      editableLeaves(key, value, [...path, k]),
    )
  }
  if (typeof attributes === "string" && !isLocked(key, path)) {
    return [{ path, value: attributes }]
  }
  return []
}

/** A copy of `target` with the value at `path` replaced. */
export function setAt(target: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) return value
  const [head, ...rest] = path
  if (Array.isArray(target)) {
    return target.map((item, i) =>
      i === head ? setAt(item, rest, value) : item,
    )
  }
  const object = target as Record<string, unknown>
  return { ...object, [head]: setAt(object[head], rest, value) }
}
