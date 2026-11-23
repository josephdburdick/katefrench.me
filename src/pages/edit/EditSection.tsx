import EditShell from "@/components/edit/EditShell"
import { AddButton, ItemMenu, moved } from "@/components/edit/ItemMenu"
import { FieldError, SaveBar, TextField } from "@/components/edit/fields"
import { labelParts } from "@/components/edit/labels"
import { useEditContent, useSave } from "@/components/edit/useEdit"
import {
  EDIT_LIMITS,
  type EditEntry,
  type Path,
  type SectionKey,
  editableLeaves,
  fieldKey,
  flexList,
  isLocked,
  isSectionKey,
  sectionTitle,
  setAt,
  validateSection,
} from "@/lib/edit-content"
import { type ReactNode, useState } from "react"
import { useParams } from "react-router"

const isLong = (value: string) => value.length > 60 || value.includes("\n")

const LONG_NAMES = new Set(["text", "paragraph", "takeaway", "caption"])

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

function SectionForm({
  token,
  sectionKey,
  entry,
}: {
  token: string
  sectionKey: SectionKey
  entry: EditEntry
}) {
  const [attributes, setAttributes] = useState<unknown>(entry.attributes)
  const [body, setBody] = useState(entry.body)
  const [draft, setDraft] = useState(entry.draft)
  const { status, errors, save, changed } = useSave(
    token,
    `/sections/${sectionKey}`,
  )
  const [longAtStart] = useState(
    () =>
      new Set(
        editableLeaves(sectionKey, entry.attributes)
          .filter((leaf) => isLong(leaf.value))
          .map((leaf) => fieldKey(leaf.path)),
      ),
  )
  const showBody = entry.body.trim() !== ""
  const placed = new Set(["draft", ...(showBody ? ["body"] : [])])

  const set = (path: Path, value: unknown) => {
    setAttributes((all: unknown) => setAt(all, path, value))
    changed()
  }

  const field = (path: Path, value: string, label: string) => {
    const key = fieldKey(["attributes", ...path])
    const name = [...path].reverse().find((part) => typeof part === "string")
    placed.add(key)
    return (
      <TextField
        key={key}
        id={`edit-${key}`}
        label={label}
        value={value}
        multiline={
          longAtStart.has(fieldKey(path)) || LONG_NAMES.has(String(name))
        }
        maxLength={EDIT_LIMITS.text}
        error={errors[key]}
        onChange={(next) => set(path, next)}
      />
    )
  }

  /** `labelFrom` is how many leading path parts the surrounding heading already names. */
  const render = (value: unknown, path: Path, labelFrom: number): ReactNode => {
    if (typeof value === "string") {
      if (isLocked(sectionKey, path)) return null
      return field(path, value, labelParts(path.slice(labelFrom)).join(" · "))
    }
    if (isObject(value)) {
      return Object.entries(value).map(([k, v]) =>
        render(v, [...path, k], labelFrom),
      )
    }
    if (!Array.isArray(value)) return null
    const flex = flexList(sectionKey, path)
    if (!flex) return value.map((v, i) => render(v, [...path, i], labelFrom))

    const listKey = fieldKey(["attributes", ...path])
    placed.add(listKey)
    return (
      <div key={listKey} className="flex min-w-0 flex-col gap-3">
        {value.map((item, i) => {
          const itemPath = [...path, i]
          const itemKey = fieldKey(["attributes", ...itemPath])
          const name = `${flex.noun} ${i + 1}`
          placed.add(itemKey)
          const menu = (
            <ItemMenu
              name={name}
              first={i === 0}
              last={i === value.length - 1}
              canDelete={value.length > flex.min}
              onMove={(by) => set(path, moved(value, i, by))}
              onDelete={() =>
                set(
                  path,
                  value.filter((_, j) => j !== i),
                )
              }
            />
          )
          if (typeof item === "string") {
            return (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  {field(itemPath, item, capitalize(name))}
                </div>
                {menu}
              </div>
            )
          }
          return (
            <div
              key={i}
              className="border-primary/20 bg-background flex min-w-0 flex-col gap-4 rounded-lg border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium">{capitalize(name)}</span>
                {menu}
              </div>
              <FieldError id={`edit-${itemKey}`} message={errors[itemKey]} />
              {render(item, itemPath, itemPath.length)}
            </div>
          )
        })}
        {flex.item !== undefined && value.length < flex.max && (
          <AddButton
            onClick={() => set(path, [...value, structuredClone(flex.item)])}
          >
            Add a {flex.noun}
          </AddButton>
        )}
        <FieldError id={`edit-${listKey}`} message={errors[listKey]} />
      </div>
    )
  }

  const groups = Object.entries(isObject(attributes) ? attributes : {}).map(
    ([name, value]) => {
      if (typeof value === "string") {
        return render(value, [name], 0)
      }
      const flex = Array.isArray(value) && flexList(sectionKey, [name])
      if (!flex && editableLeaves(sectionKey, value, [name]).length === 0) {
        return null
      }
      return (
        <fieldset
          key={name}
          className="border-primary/20 bg-secondary flex min-w-0 flex-col gap-4 rounded-lg border p-4"
        >
          <legend className="font-display text-primary px-1 text-lg">
            {labelParts([name])[0]}
          </legend>
          {render(value, [name], Array.isArray(value) ? 0 : 1)}
        </fieldset>
      )
    },
  )
  const unplaced = Object.entries(errors).find(([key]) => !placed.has(key))

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        const request = { body, attributes, draft }
        save(request, validateSection(sectionKey, request, entry))
      }}
    >
      {showBody && (
        <TextField
          id="edit-body"
          label="Main text"
          value={body}
          multiline
          rows={10}
          maxLength={EDIT_LIMITS.markdown}
          error={errors.body}
          onChange={(value) => {
            setBody(value)
            changed()
          }}
        />
      )}
      {groups}
      {unplaced && <p className="font-semibold">{unplaced[1]}</p>}
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

export default function EditSection() {
  const { token = "", key } = useParams()
  const { state, retry } = useEditContent(token)
  const sectionKey = isSectionKey(key) && key !== "numbers" ? key : undefined
  const shown =
    !sectionKey || (state.status === "ready" && !state.data[sectionKey])
      ? ({ status: "not-found" } as const)
      : state

  return (
    <EditShell
      token={token}
      title={sectionKey ? sectionTitle(sectionKey) : ""}
      state={shown}
      retry={retry}
    >
      {(data) => (
        <SectionForm
          token={token}
          sectionKey={sectionKey!}
          entry={data[sectionKey!]!}
        />
      )}
    </EditShell>
  )
}
