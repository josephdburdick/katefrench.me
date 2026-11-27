import EditShell, { cardLinkClass } from "@/components/edit/EditShell"
import { inputClass } from "@/components/edit/fields"
import { useEditLoad } from "@/components/edit/useEdit"
import { intentOption } from "@/lib/contact-form"
import {
  LEAD_STATUSES,
  type LeadStatus,
  type LeadsResponse,
  formatLeadTime,
  isLeadStatus,
  leadStatusLabel,
  sourceLabel,
} from "@/lib/leads"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { Link, useParams } from "react-router"

function LeadsList({ token, data }: { token: string; data: LeadsResponse }) {
  const [filter, setFilter] = useState<LeadStatus | "all">("all")
  const { summary, leads } = data
  const shown =
    filter === "all" ? leads : leads.filter((lead) => lead.status === filter)

  return (
    <>
      <dl className="border-primary/20 bg-secondary grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-4 sm:grid-cols-3">
        <div className="col-span-full flex gap-2">
          <dt className="font-semibold">This month:</dt>
          <dd className="font-display text-primary">{summary.thisMonth}</dd>
        </div>
        {LEAD_STATUSES.map(({ value, label }) => (
          <div key={value} className="flex gap-2">
            <dt>{label}:</dt>
            <dd className="font-semibold">{summary.byStatus[value]}</dd>
          </div>
        ))}
      </dl>
      <p className="font-display text-primary text-xl">
        {summary.byStatus.new} new
      </p>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="leads-filter" className="text-sm font-semibold">
          Show
        </label>
        <select
          id="leads-filter"
          value={filter}
          className={cn(inputClass, "max-w-60")}
          onChange={(event) => {
            const value = event.target.value
            setFilter(isLeadStatus(value) ? value : "all")
          }}
        >
          <option value="all">All</option>
          {LEAD_STATUSES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <p>
          {leads.length === 0
            ? "No leads yet. They show here when someone sends the contact form."
            : "No leads with this status."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((lead) => (
            <li key={lead.id}>
              <Link
                viewTransition
                to={`/edit/${token}/leads/${encodeURIComponent(lead.id)}`}
                className={cn(cardLinkClass, "items-start")}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="break-words">{lead.name}</span>
                  <span className="text-sm font-normal break-words">
                    {intentOption(lead.intent).short} ·{" "}
                    {sourceLabel(lead.fromSection)}
                  </span>
                  <span className="text-sm font-normal">
                    {formatLeadTime(lead.createdAt)}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-sm",
                    lead.status === "new"
                      ? "bg-primary text-primary-foreground"
                      : "border-primary/30 border",
                  )}
                >
                  {leadStatusLabel(lead.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function EditLeads() {
  const { token = "" } = useParams()
  const { state, retry } = useEditLoad<LeadsResponse>(token, "/leads")

  return (
    <EditShell token={token} title="Leads" state={state} retry={retry}>
      {(data) => <LeadsList token={token} data={data} />}
    </EditShell>
  )
}
