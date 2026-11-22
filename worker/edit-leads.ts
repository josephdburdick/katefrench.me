import { type Context, Hono } from "hono"

import type { Intent } from "../src/lib/contact-form"
import {
  LEAD_STATUS_VALUES,
  type LeadDetail,
  type LeadListItem,
  type LeadStatus,
  type LeadUpdate,
  type LeadsResponse,
  monthStart,
  validateLeadUpdate,
} from "../src/lib/leads"
import {
  type EditEnv,
  MAX_TOKEN_LENGTH,
  invalid,
  loadFailed,
  notFound,
  readBody,
  saveFailed,
} from "./edit"

type Row = {
  id: string
  created_at: string
  intent: Intent
  answers: string
  name: string
  email: string
  company: string | null
  from_section: string | null
  status: LeadStatus
  notes: string
}

const listItem = (row: Row): LeadListItem => ({
  id: row.id,
  createdAt: row.created_at,
  intent: row.intent,
  name: row.name,
  company: row.company,
  fromSection: row.from_section,
  status: row.status,
})

const leadId = (c: Context<EditEnv>) => {
  const id = c.req.param("id") ?? ""
  return id && id.length <= MAX_TOKEN_LENGTH ? id : undefined
}

/** Mounted on the `edit` app at `/leads`, so the token check and edit headers run first. */
export const editLeads = new Hono<EditEnv>()

editLeads.get("/", async (c) => {
  let rows: Row[]
  try {
    ;({ results: rows } = await c.env.DB.prepare(
      "SELECT id, created_at, intent, name, company, from_section, status FROM leads ORDER BY status = 'new' DESC, created_at DESC, id",
    ).all<Row>())
  } catch (err) {
    return loadFailed(c, err)
  }
  const start = monthStart(new Date())
  const byStatus = Object.fromEntries(
    LEAD_STATUS_VALUES.map((status) => [status, 0]),
  ) as Record<LeadStatus, number>
  for (const row of rows) byStatus[row.status] += 1
  const response: LeadsResponse = {
    summary: {
      thisMonth: rows.filter((row) => row.created_at >= start).length,
      byStatus,
    },
    leads: rows.map(listItem),
  }
  return c.json(response)
})

editLeads.get("/:id", async (c) => {
  const id = leadId(c)
  if (!id) return notFound(c)
  let detail: LeadDetail
  try {
    const row = await c.env.DB.prepare(
      "SELECT id, created_at, intent, answers, name, email, company, from_section, status, notes FROM leads WHERE id = ?",
    )
      .bind(id)
      .first<Row>()
    if (!row) return notFound(c)
    detail = {
      ...listItem(row),
      email: row.email,
      answers: JSON.parse(row.answers),
      notes: row.notes,
    }
  } catch (err) {
    return loadFailed(c, err)
  }
  return c.json(detail)
})

editLeads.put("/:id", async (c) => {
  const id = leadId(c)
  if (!id) return notFound(c)

  const parsed = await readBody(c)
  if (!parsed.ok) return parsed.response
  const fields = validateLeadUpdate(parsed.body)
  if (Object.keys(fields).length > 0) return invalid(c, fields)

  const { status, notes } = parsed.body as LeadUpdate
  let changes: number
  try {
    const result = await c.env.DB.prepare(
      "UPDATE leads SET status = ?, notes = ? WHERE id = ?",
    )
      .bind(status, notes, id)
      .run()
    changes = result.meta.changes
  } catch (err) {
    return saveFailed(c, err)
  }
  if (changes === 0) return notFound(c)
  return c.json({ ok: true })
})

editLeads.delete("/:id", async (c) => {
  const id = leadId(c)
  if (!id) return notFound(c)
  let changes: number
  try {
    const result = await c.env.DB.prepare("DELETE FROM leads WHERE id = ?")
      .bind(id)
      .run()
    changes = result.meta.changes
  } catch (err) {
    return saveFailed(c, err)
  }
  if (changes === 0) return notFound(c)
  return c.json({ ok: true })
})
