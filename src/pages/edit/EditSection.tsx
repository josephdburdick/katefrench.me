import EditShell from "@/components/edit/EditShell"
import { SaveBar, TextField } from "@/components/edit/fields"
import { labelParts } from "@/components/edit/labels"
import { useEditContent, useSave } from "@/components/edit/useEdit"
import {
  EDIT_LIMITS,
  type EditEntry,
  type Path,
  type SectionKey,
  editableLeaves,
  fieldKey,
  isSectionKey,
  sectionTitle,
  setAt,
  validateSection,
} from "@/lib/edit-content"
import { useState } from "react"
import { useParams } from "react-router"

type Leaf = { path: Path; value: string }

const getAt = (target: unknown, path: Path) =>
  path.reduce<any>((value, segment) => value?.[segment], target) as string

const isLong = (value: string) => value.length > 60 || value.includes("\n")

/** Leaves grouped by their top-level attribute, so a section reads in the order the page shows it. */
function groupLeaves(leaves: Leaf[]) {
  const groups: { name: string | number; leaves: Leaf[] }[] = []
  for (const leaf of leaves) {
    const last = groups[groups.length - 1]
    if (last && last.name === leaf.path[0]) last.leaves.push(leaf)
    else groups.push({ name: leaf.path[0], leaves: [leaf] })
  }
  return groups
}

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
  const [leaves] = useState(() => editableLeaves(sectionKey, entry.attributes))
  const showBody = entry.body.trim() !== ""

  const field = (leaf: Leaf, label: string) => {
    const key = fieldKey(["attributes", ...leaf.path])
    return (
      <TextField
        key={key}
        id={`edit-${key}`}
        label={label}
        value={getAt(attributes, leaf.path)}
        multiline={isLong(leaf.value)}
        maxLength={EDIT_LIMITS.text}
        error={errors[key]}
        onChange={(next) => {
          setAttributes((all: unknown) => setAt(all, leaf.path, next))
          changed()
        }}
      />
    )
  }

  const placed = new Set([
    "draft",
    ...(showBody ? ["body"] : []),
    ...leaves.map((leaf) => fieldKey(["attributes", ...leaf.path])),
  ])
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
      {groupLeaves(leaves).map((group) => {
        const [first] = group.leaves
        if (group.leaves.length === 1 && first.path.length === 1) {
          return field(first, labelParts(first.path).join(" · "))
        }
        return (
          <fieldset
            key={String(group.name)}
            className="border-primary/20 bg-secondary flex min-w-0 flex-col gap-4 rounded-lg border p-4"
          >
            <legend className="font-display text-primary px-1 text-lg">
              {labelParts([group.name])[0]}
            </legend>
            {group.leaves.map((leaf) => {
              const parts = labelParts(leaf.path)
              return field(
                leaf,
                (typeof leaf.path[1] === "string"
                  ? parts.slice(1)
                  : parts
                ).join(" · "),
              )
            })}
          </fieldset>
        )
      })}
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
