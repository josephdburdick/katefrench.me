import EditShell, { linkClass } from "@/components/edit/EditShell"
import { deleteEdit } from "@/components/edit/api"
import {
  FieldError,
  SAVE_STATUS_TEXT,
  TextField,
  inputClass,
} from "@/components/edit/fields"
import { useEditLoad, useSave } from "@/components/edit/useEdit"
import { Button } from "@/components/ui/button"
import { answerPairs } from "@/lib/contact-form"
import {
  LEAD_LIMITS,
  LEAD_STATUSES,
  type LeadDetail,
  type LeadStatus,
  type LeadUpdate,
  formatLeadTime,
  isLeadStatus,
  sourceLabel,
  validateLeadUpdate,
} from "@/lib/leads"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useNavigate, useParams } from "react-router"

const buttonClass = "min-h-11 text-base"

function Answers({ lead }: { lead: LeadDetail }) {
  const pairs = answerPairs({
    intent: lead.intent,
    details: lead.answers.details,
    message: lead.answers.message,
    name: lead.name,
    email: lead.email,
    company: lead.company ?? "",
  })
  return (
    <dl className="border-primary/20 bg-secondary flex flex-col gap-4 rounded-lg border p-4">
      {[
        ...pairs,
        ["Came from", sourceLabel(lead.fromSection)],
        ["Sent", formatLeadTime(lead.createdAt)],
      ].map(([question, answer], i) => (
        <div key={i} className="flex min-w-0 flex-col gap-1">
          <dt className="text-sm font-semibold">{question}</dt>
          <dd className="break-words whitespace-pre-line">{answer}</dd>
        </div>
      ))}
    </dl>
  )
}

function LeadForm({ token, lead }: { token: string; lead: LeadDetail }) {
  const [status, setStatus] = useState<LeadStatus>(lead.status)
  const [notes, setNotes] = useState(lead.notes)
  const save = useSave(token, `/leads/${encodeURIComponent(lead.id)}`)

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        const body: LeadUpdate = { status, notes }
        save.save(body, validateLeadUpdate(body))
      }}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="lead-status" className="text-sm font-semibold">
          Status
        </label>
        <select
          id="lead-status"
          value={status}
          aria-invalid={save.errors.status ? true : undefined}
          aria-describedby={
            save.errors.status ? "lead-status-error" : undefined
          }
          className={cn(inputClass, "max-w-60")}
          onChange={(event) => {
            if (isLeadStatus(event.target.value)) setStatus(event.target.value)
            save.changed()
          }}
        >
          {LEAD_STATUSES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <FieldError id="lead-status" message={save.errors.status} />
      </div>
      <TextField
        id="lead-notes"
        label="Notes, only for you"
        value={notes}
        multiline
        rows={6}
        maxLength={LEAD_LIMITS.notes}
        error={save.errors.notes}
        onChange={(value) => {
          setNotes(value)
          save.changed()
        }}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" className={cn(buttonClass, "min-w-24")}>
          Save
        </Button>
        <p aria-live="polite" className="font-semibold">
          {SAVE_STATUS_TEXT[save.status]}
        </p>
      </div>
    </form>
  )
}

function DeleteLead({ token, lead }: { token: string; lead: LeadDetail }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [failed, setFailed] = useState(false)

  async function confirm() {
    if (deleting) return
    setDeleting(true)
    setFailed(false)
    const ok = await deleteEdit(token, `/leads/${encodeURIComponent(lead.id)}`)
    if (ok) {
      navigate(`/edit/${token}/leads`, { viewTransition: true })
      return
    }
    setDeleting(false)
    setFailed(true)
  }

  return (
    <div className="border-primary/20 flex flex-col gap-4 border-t pt-5">
      {confirming ? (
        <div
          role="group"
          aria-labelledby="lead-delete-question"
          className="border-foreground flex flex-col gap-4 rounded-lg border-2 p-4"
        >
          <p id="lead-delete-question" className="font-semibold">
            Delete this lead? It and your notes will be gone for good.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              className={buttonClass}
              disabled={deleting}
              onClick={confirm}
            >
              Delete for good
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(buttonClass, "border-primary/30")}
              onClick={() => {
                setConfirming(false)
                setFailed(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className={cn(buttonClass, "border-primary/30 self-start")}
          onClick={() => setConfirming(true)}
        >
          Delete lead
        </Button>
      )}
      <p aria-live="polite" className="font-semibold">
        {failed ? "Not deleted. Check your connection, then try again." : ""}
      </p>
    </div>
  )
}

export default function EditLead() {
  const { token = "", id = "" } = useParams()
  const { state, retry } = useEditLoad<LeadDetail>(
    token,
    `/leads/${encodeURIComponent(id)}`,
  )

  return (
    <EditShell
      token={token}
      title={state.status === "ready" ? state.data.name : "Lead"}
      state={state}
      retry={retry}
      back={{ to: `/edit/${token}/leads`, label: "Back to leads" }}
    >
      {(lead) => (
        <>
          <Answers lead={lead} />
          <a
            href={`mailto:${encodeURIComponent(lead.email)}`}
            className={cn(linkClass, "self-start")}
          >
            Reply by email
          </a>
          <LeadForm token={token} lead={lead} />
          <DeleteLead token={token} lead={lead} />
        </>
      )}
    </EditShell>
  )
}
