import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import type { InputHTMLAttributes } from "react"

import type { SaveStatus } from "./useEdit"

export const inputClass =
  "min-h-11 w-full min-w-0 rounded-md border border-primary/30 bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-foreground"

const errorId = (id: string) => `${id}-error`

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={errorId(id)} className="text-sm font-semibold">
      {message}
    </p>
  )
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  multiline,
  rows = 3,
  maxLength,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  multiline?: boolean
  rows?: number
  maxLength: number
}) {
  const shared = {
    id,
    value,
    maxLength,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId(id) : undefined,
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {multiline ? (
        <textarea
          {...shared}
          rows={rows}
          className={cn(inputClass, "resize-y")}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...shared}
          type="text"
          className={inputClass}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <FieldError id={id} message={error} />
    </div>
  )
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  ...range
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
} & Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "min" | "max" | "step" | "inputMode"
>) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="number"
        {...range}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId(id) : undefined}
        className={cn(inputClass, "max-w-40")}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError id={id} message={error} />
    </div>
  )
}

export const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved.",
  invalid: "Not saved. Fix the marked fields, then tap Save.",
  failed: "Not saved. Check your connection, then tap Save again.",
}

/** The draft toggle, the Save button and the live region that says how the save went. */
export function SaveBar({
  draft,
  onDraft,
  status,
  error,
}: {
  draft: boolean
  onDraft: (draft: boolean) => void
  status: SaveStatus
  error?: string
}) {
  return (
    <div className="border-primary/20 flex flex-col gap-4 border-t pt-5">
      <div className="flex flex-col gap-1">
        <label className="has-[:focus-visible]:ring-ring flex min-h-11 cursor-pointer items-center gap-3 self-start rounded-md pr-2 has-[:focus-visible]:ring-2">
          <span className="relative inline-flex size-11 shrink-0">
            <input
              type="checkbox"
              checked={draft}
              aria-describedby="edit-draft-hint"
              onChange={(event) => onDraft(event.target.checked)}
              className="peer border-primary bg-background checked:bg-primary size-11 cursor-pointer appearance-none rounded-lg border-2 focus-visible:outline-none"
            />
            <Check
              aria-hidden="true"
              className="text-primary-foreground pointer-events-none absolute inset-0 m-auto hidden size-7 peer-checked:block"
            />
          </span>
          <span className="font-semibold">Draft</span>
        </label>
        <p id="edit-draft-hint" className="text-sm">
          Leave this on until the wording is final.
        </p>
        <FieldError id="edit-draft" message={error} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" className="min-h-11 min-w-24 text-base">
          Save
        </Button>
        <p aria-live="polite" className="font-semibold">
          {SAVE_STATUS_TEXT[status]}
        </p>
      </div>
    </div>
  )
}
