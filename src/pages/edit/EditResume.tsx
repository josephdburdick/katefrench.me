import EditShell, { linkClass } from "@/components/edit/EditShell"
import { AddButton, ItemMenu, moved } from "@/components/edit/ItemMenu"
import {
  FieldError,
  SAVE_STATUS_TEXT,
  TextField,
  inputClass,
} from "@/components/edit/fields"
import { useEditLoad, useSave } from "@/components/edit/useEdit"
import { Button } from "@/components/ui/button"
import type { EditErrors } from "@/lib/edit-content"
import {
  RESUME_LIMITS,
  type ResumeContent,
  validateResume,
} from "@/lib/edit-resume"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useParams } from "react-router"

type EntryState = {
  id: number
  title: string
  place: string
  start: string
  end: string
  current: boolean
  /** One point per line. */
  details: string
}

type SectionState = {
  id: number
  kind: "text" | "list"
  title: string
  text: string
  entries: EntryState[]
}

let lastId = 0
const newId = () => ++lastId

const thisYear = () => String(new Date().getFullYear())

function toRequest(sections: SectionState[]): ResumeContent {
  return {
    sections: sections.map((section) =>
      section.kind === "text"
        ? { kind: "text", title: section.title, text: section.text }
        : {
            kind: "list",
            title: section.title,
            entries: section.entries.map((entry) => ({
              title: entry.title,
              place: entry.place,
              start: Number(entry.start),
              end: entry.current ? null : Number(entry.end),
              details: entry.details
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            })),
          },
    ),
  }
}

function YearField({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={RESUME_LIMITS.minYear}
        max={RESUME_LIMITS.maxYear}
        value={disabled ? "" : value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className={cn(inputClass, "w-28 disabled:opacity-50")}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError id={id} message={error} />
    </div>
  )
}

function ResumeForm({ token, data }: { token: string; data: ResumeContent }) {
  const [sections, setSections] = useState<SectionState[]>(() =>
    data.sections.map((section) => ({
      id: newId(),
      kind: section.kind,
      title: section.title,
      text: section.kind === "text" ? section.text : "",
      entries:
        section.kind === "list"
          ? section.entries.map((entry) => ({
              id: newId(),
              title: entry.title,
              place: entry.place,
              start: String(entry.start),
              end: entry.end === null ? thisYear() : String(entry.end),
              current: entry.end === null,
              details: entry.details.join("\n"),
            }))
          : [],
    })),
  )
  const [open, setOpen] = useState<Set<number>>(() => new Set())
  const [notice, setNotice] = useState("")
  const { status, errors, save, changed } = useSave(token, "/resume")

  const change = (next: (all: SectionState[]) => SectionState[]) => {
    setSections(next)
    changed()
  }
  const patchSection = (id: number, patch: Partial<SectionState>) =>
    change((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const patchEntry = (
    sectionId: number,
    id: number,
    patch: Partial<EntryState>,
  ) =>
    change((all) =>
      all.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              entries: s.entries.map((e) =>
                e.id === id ? { ...e, ...patch } : e,
              ),
            }
          : s,
      ),
    )
  const toggle = (id: number) =>
    setOpen((all) => {
      const next = new Set(all)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  function addSection(kind: SectionState["kind"]) {
    change((all) => [
      ...all,
      { id: newId(), kind, title: "", text: "", entries: [] },
    ])
    setNotice("Added a new section at the end.")
  }

  function addEntry(sectionId: number) {
    const id = newId()
    change((all) =>
      all.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              entries: [
                {
                  id,
                  title: "",
                  place: "",
                  start: thisYear(),
                  end: thisYear(),
                  current: true,
                  details: "",
                },
                ...s.entries,
              ],
            }
          : s,
      ),
    )
    setOpen((all) => new Set(all).add(id))
    setNotice("Added a new entry at the top.")
  }

  const hasError = (prefix: string, all: EditErrors = errors) =>
    Object.keys(all).some((key) => key.startsWith(prefix))

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        const request = toRequest(sections)
        void save(request, validateResume(request))
      }}
    >
      <p>
        Change, reorder, add or delete anything here. Nothing shows on your
        resume until you tap Save.
      </p>

      {sections.map((section, i) => {
        const at = `sections.${i}`
        const name = section.title.trim() || "this section"
        return (
          <fieldset
            key={section.id}
            className="border-primary/20 bg-secondary flex min-w-0 flex-col gap-4 rounded-lg border p-4"
          >
            <legend className="font-display text-primary px-1 text-lg">
              {section.title.trim() || "New section"}
            </legend>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <TextField
                  id={`resume-${section.id}-title`}
                  label="Section title"
                  value={section.title}
                  maxLength={RESUME_LIMITS.line}
                  error={errors[`${at}.title`]}
                  onChange={(title) => patchSection(section.id, { title })}
                />
              </div>
              <ItemMenu
                name={name}
                first={i === 0}
                last={i === sections.length - 1}
                onMove={(by) => {
                  change((all) => moved(all, i, by))
                  setNotice(`Moved ${name} ${by < 0 ? "up" : "down"}.`)
                }}
                onDelete={() => {
                  change((all) => all.filter((s) => s.id !== section.id))
                  setNotice(`Deleted ${name}.`)
                }}
              />
            </div>
            <FieldError id={`resume-${section.id}`} message={errors[at]} />

            {section.kind === "text" ? (
              <TextField
                id={`resume-${section.id}-text`}
                label="Text"
                value={section.text}
                multiline
                rows={6}
                maxLength={RESUME_LIMITS.text}
                error={errors[`${at}.text`]}
                onChange={(text) => patchSection(section.id, { text })}
              />
            ) : (
              <>
                <AddButton onClick={() => addEntry(section.id)}>
                  Add an entry
                </AddButton>
                <FieldError
                  id={`resume-${section.id}-entries`}
                  message={errors[`${at}.entries`]}
                />
                <ul className="flex flex-col gap-3">
                  {section.entries.map((entry, j) => {
                    const entryAt = `${at}.entries.${j}`
                    const entryName = entry.title.trim() || "this entry"
                    const expanded =
                      open.has(entry.id) || hasError(`${entryAt}`)
                    const fieldId = `resume-${section.id}-${entry.id}`
                    return (
                      <li
                        key={entry.id}
                        className="border-primary/20 bg-background flex min-w-0 flex-col gap-4 rounded-lg border p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            className="focus-visible:ring-ring flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded-md text-left focus-visible:ring-2 focus-visible:outline-none"
                            onClick={() => toggle(entry.id)}
                          >
                            <span className="font-medium break-words">
                              {entry.title.trim() || "New entry"}
                            </span>
                            <span className="text-foreground/70 text-sm">
                              {entry.start} to{" "}
                              {entry.current ? "now" : entry.end}
                              {" · "}
                              <span className="text-primary underline underline-offset-4">
                                {expanded ? "Close" : "Edit"}
                              </span>
                            </span>
                          </button>
                          <ItemMenu
                            name={entryName}
                            first={j === 0}
                            last={j === section.entries.length - 1}
                            onMove={(by) => {
                              patchSection(section.id, {
                                entries: moved(section.entries, j, by),
                              })
                              setNotice(
                                `Moved ${entryName} ${by < 0 ? "up" : "down"}.`,
                              )
                            }}
                            onDelete={() => {
                              patchSection(section.id, {
                                entries: section.entries.filter(
                                  (e) => e.id !== entry.id,
                                ),
                              })
                              setNotice(`Deleted ${entryName}.`)
                            }}
                          />
                        </div>
                        <FieldError id={fieldId} message={errors[entryAt]} />
                        {expanded && (
                          <>
                            <TextField
                              id={`${fieldId}-title`}
                              label="Title"
                              value={entry.title}
                              maxLength={RESUME_LIMITS.line}
                              error={errors[`${entryAt}.title`]}
                              onChange={(title) =>
                                patchEntry(section.id, entry.id, { title })
                              }
                            />
                            <TextField
                              id={`${fieldId}-place`}
                              label="Place, employer or school (optional)"
                              value={entry.place}
                              maxLength={RESUME_LIMITS.line}
                              error={errors[`${entryAt}.place`]}
                              onChange={(place) =>
                                patchEntry(section.id, entry.id, { place })
                              }
                            />
                            <div className="flex flex-wrap items-start gap-4">
                              <YearField
                                id={`${fieldId}-start`}
                                label="Start year"
                                value={entry.start}
                                error={errors[`${entryAt}.start`]}
                                onChange={(start) =>
                                  patchEntry(section.id, entry.id, { start })
                                }
                              />
                              <YearField
                                id={`${fieldId}-end`}
                                label="End year"
                                value={entry.end}
                                disabled={entry.current}
                                error={errors[`${entryAt}.end`]}
                                onChange={(end) =>
                                  patchEntry(section.id, entry.id, { end })
                                }
                              />
                              <label className="mt-7 flex min-h-11 cursor-pointer items-center gap-2 font-medium">
                                <input
                                  type="checkbox"
                                  checked={entry.current}
                                  className="accent-primary size-5"
                                  onChange={(event) =>
                                    patchEntry(section.id, entry.id, {
                                      current: event.target.checked,
                                    })
                                  }
                                />
                                Still current
                              </label>
                            </div>
                            <TextField
                              id={`${fieldId}-details`}
                              label="Points, one per line (optional)"
                              value={entry.details}
                              multiline
                              rows={6}
                              maxLength={
                                RESUME_LIMITS.detail * RESUME_LIMITS.details
                              }
                              error={errors[`${entryAt}.details`]}
                              onChange={(details) =>
                                patchEntry(section.id, entry.id, { details })
                              }
                            />
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </fieldset>
        )
      })}

      <div className="flex flex-col gap-3">
        <FieldError id="resume-sections" message={errors.sections} />
        <AddButton onClick={() => addSection("text")}>
          Add a text section
        </AddButton>
        <AddButton onClick={() => addSection("list")}>
          Add a section with dated entries
        </AddButton>
        <p className="text-sm">
          Use dated entries for jobs, schools and certificates.
        </p>
      </div>

      <p aria-live="polite" className="sr-only">
        {notice}
      </p>

      <div className="border-primary/20 bg-background sticky bottom-0 -mx-1 flex flex-wrap items-center gap-4 border-t px-1 py-3">
        <Button
          type="submit"
          className="focus-visible:ring-ring min-h-11 min-w-24 text-base focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Save
        </Button>
        <p aria-live="polite" className="font-semibold">
          {SAVE_STATUS_TEXT[status]}
        </p>
        <a href="/cv" className={linkClass}>
          View your resume
        </a>
      </div>
    </form>
  )
}

export default function EditResume() {
  const { token = "" } = useParams()
  const { state, retry } = useEditLoad<ResumeContent>(token, "/resume")
  return (
    <EditShell token={token} title="Resume" state={state} retry={retry}>
      {(data) => <ResumeForm token={token} data={data} />}
    </EditShell>
  )
}
