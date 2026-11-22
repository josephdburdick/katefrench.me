import EditShell from "@/components/edit/EditShell"
import { NumberField, SaveBar, TextField } from "@/components/edit/fields"
import { useEditContent, useSave } from "@/components/edit/useEdit"
import {
  EDIT_LIMITS,
  type EditEntry,
  NUMBER_RANGES,
  sectionTitle,
  validateNumbers,
} from "@/lib/edit-content"
import { type NumberItem, type NumberKind, formatNumber } from "@/lib/numbers"
import { useState } from "react"
import { useParams } from "react-router"

const VALUE_LABELS: Record<NumberKind, string> = {
  ratio: "Number, as in 1 in …",
  percent: "Number, in percent",
  multiple: "Number, as a multiple (×)",
}

type Item = { id: string; kind: NumberKind; value: string; label: string }

// A value that isn't a number goes to the check as typed, so it gets the field's error.
const toValue = (value: string): number | string => {
  const n = Number(value)
  return value.trim() === "" || !Number.isFinite(n) ? value : n
}

function NumbersForm({ token, entry }: { token: string; entry: EditEntry }) {
  const stored: { label: string; items: NumberItem[] } = entry.attributes
  const [label, setLabel] = useState(stored.label)
  const [items, setItems] = useState<Item[]>(() =>
    stored.items.map(({ id, kind, value, label }) => ({
      id,
      kind,
      value: String(value),
      label,
    })),
  )
  const [draft, setDraft] = useState(entry.draft)
  const { status, errors, save, changed } = useSave(token, "/numbers")

  const updateItem = (i: number, change: Partial<Item>) => {
    setItems((all) =>
      all.map((item, j) => (i === j ? { ...item, ...change } : item)),
    )
    changed()
  }

  const placed = new Set([
    "label",
    "draft",
    ...items.flatMap((_, i) => [`items.${i}.value`, `items.${i}.label`]),
  ])
  const unplaced = Object.entries(errors).find(([key]) => !placed.has(key))

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        const body = {
          label,
          items: items.map(({ id, value, label }) => ({
            id,
            value: toValue(value),
            label,
          })),
          draft,
        }
        save(body, validateNumbers(body, stored))
      }}
    >
      <TextField
        id="edit-label"
        label="Heading above the numbers"
        value={label}
        maxLength={EDIT_LIMITS.text}
        error={errors.label}
        onChange={(value) => {
          setLabel(value)
          changed()
        }}
      />
      {unplaced && <p className="font-semibold">{unplaced[1]}</p>}
      {items.map((item, i) => {
        const range = NUMBER_RANGES[item.kind]
        const value = toValue(item.value)
        return (
          <fieldset
            key={item.id}
            className="border-primary/20 bg-secondary flex min-w-0 flex-col gap-4 rounded-lg border p-4"
          >
            <legend className="font-display text-primary px-1 text-lg">
              Number {i + 1}
            </legend>
            <p
              className="font-display text-primary text-4xl"
              aria-hidden="true"
            >
              {typeof value === "number"
                ? formatNumber({ kind: item.kind, value })
                : "…"}
            </p>
            <NumberField
              id={`edit-items.${i}.value`}
              label={VALUE_LABELS[item.kind]}
              value={item.value}
              min={range.min}
              max={range.max}
              step={range.step}
              inputMode={range.step < 1 ? "decimal" : "numeric"}
              error={errors[`items.${i}.value`]}
              onChange={(value) => updateItem(i, { value })}
            />
            <TextField
              id={`edit-items.${i}.label`}
              label="What it counts"
              value={item.label}
              maxLength={EDIT_LIMITS.numberLabel}
              error={errors[`items.${i}.label`]}
              onChange={(label) => updateItem(i, { label })}
            />
          </fieldset>
        )
      })}
      <SaveBar
        draft={draft}
        onDraft={(value) => {
          setDraft(value)
          changed()
        }}
        status={status}
        error={errors.draft}
      />
    </form>
  )
}

export default function EditNumbers() {
  const { token = "" } = useParams()
  const { state, retry } = useEditContent(token)
  const notFound =
    state.status === "ready" && !state.data.numbers
      ? ({ status: "not-found" } as const)
      : state

  return (
    <EditShell
      token={token}
      title={sectionTitle("numbers")}
      state={notFound}
      retry={retry}
    >
      {(data) => <NumbersForm token={token} entry={data.numbers!} />}
    </EditShell>
  )
}
