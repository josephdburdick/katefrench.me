import { env, exports } from "cloudflare:workers"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  LEAD_LIMITS,
  LEAD_STATUS_VALUES,
  formatLeadTime,
  monthStart,
  sourceLabel,
  validateLeadUpdate,
} from "../src/lib/leads"
import { replaceEditToken } from "../worker/edit-token"

const TOKEN = "Zq1x8dN0vYk3rTgB7mLwE5uHcA2sJf9oPiQ4yXbV6nK"

type Seed = {
  id: string
  created_at: string
  status?: string
  name?: string
  email?: string
  company?: string | null
  from_section?: string | null
  notes?: string
}

const answers = {
  details: { role: "Sales", location: "New York", start: "Right away" },
  message: "We need someone to open New York.",
}

const insert = (lead: Seed) =>
  env.DB.prepare(
    "INSERT INTO leads (id, created_at, intent, answers, name, email, company, from_section, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      lead.id,
      lead.created_at,
      "hiring",
      JSON.stringify(answers),
      lead.name ?? `Name ${lead.id}`,
      lead.email ?? `${lead.id}@example.com`,
      lead.company ?? null,
      lead.from_section ?? null,
      lead.status ?? "new",
      lead.notes ?? "",
    )
    .run()

const allRows = async () =>
  (
    await env.DB.prepare("SELECT * FROM leads ORDER BY id").all<
      Record<string, unknown>
    >()
  ).results

const req = (path: string, init?: RequestInit) =>
  exports.default.fetch(new Request(`https://example.com${path}`, init))

const send = (
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  req(path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

const leadsPath = (rest = "", token = TOKEN) =>
  `/api/edit/${token}/leads${rest}`

const notFoundBody = { error: "not found" }

const SEEDS: Seed[] = [
  { id: "a-old-new", created_at: "2026-10-03T12:00:00.000Z" },
  {
    id: "b-won",
    created_at: "2026-11-20T12:00:00.000Z",
    status: "won",
    notes: "Signed.",
  },
  {
    id: "c-new",
    created_at: "2026-11-15T12:00:00.000Z",
    company: "Acme",
    from_section: "numbers",
  },
  {
    id: "d-replied",
    created_at: "2026-11-01T03:59:59.000Z",
    status: "replied",
  },
  { id: "e-new-latest", created_at: "2026-11-21T09:00:00.000Z" },
]

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM leads").run()
  for (const seed of SEEDS) await insert(seed)
  await replaceEditToken(env, TOKEN)
})

describe("monthStart", () => {
  it("uses the calendar month in New York", () => {
    expect(monthStart(new Date("2026-12-01T04:30:00Z"))).toBe(
      "2026-11-01T04:00:00.000Z",
    )
    expect(monthStart(new Date("2026-12-01T05:30:00Z"))).toBe(
      "2026-12-01T05:00:00.000Z",
    )
  })

  it("follows daylight saving time", () => {
    expect(monthStart(new Date("2026-07-15T12:00:00Z"))).toBe(
      "2026-07-01T04:00:00.000Z",
    )
    expect(monthStart(new Date("2026-01-31T23:00:00Z"))).toBe(
      "2026-01-01T05:00:00.000Z",
    )
    expect(monthStart(new Date("2026-11-01T04:00:00Z"))).toBe(
      "2026-11-01T04:00:00.000Z",
    )
    expect(monthStart(new Date("2026-11-01T03:59:59Z"))).toBe(
      "2026-10-01T04:00:00.000Z",
    )
  })
})

describe("validateLeadUpdate", () => {
  it("accepts every status with notes up to the limit", () => {
    for (const status of LEAD_STATUS_VALUES) {
      expect(validateLeadUpdate({ status, notes: "" })).toEqual({})
    }
    expect(
      validateLeadUpdate({
        status: "new",
        notes: "a".repeat(LEAD_LIMITS.notes),
      }),
    ).toEqual({})
  })

  it("rejects bad values and unknown keys", () => {
    expect(
      Object.keys(validateLeadUpdate({ status: "open", notes: "" })),
    ).toEqual(["status"])
    expect(
      Object.keys(validateLeadUpdate({ status: "new", notes: 3 })),
    ).toEqual(["notes"])
    expect(
      Object.keys(
        validateLeadUpdate({
          status: "new",
          notes: "a".repeat(LEAD_LIMITS.notes + 1),
        }),
      ),
    ).toEqual(["notes"])
    expect(
      Object.keys(validateLeadUpdate({ status: "new", notes: "", email: "x" })),
    ).toEqual(["email"])
    expect(Object.keys(validateLeadUpdate({})).sort()).toEqual([
      "notes",
      "status",
    ])
  })
})

describe("labels", () => {
  it("shows the source section or Direct", () => {
    expect(sourceLabel(null)).toBe("Direct")
    expect(sourceLabel("")).toBe("Direct")
    expect(sourceLabel("new-york")).toBe("New York, from zero")
  })

  it("shows times in New York", () => {
    expect(formatLeadTime("2026-12-01T04:30:00.000Z")).toBe(
      "Nov 30, 2026, 11:30 PM EST",
    )
  })
})

describe("the token and unknown ids", () => {
  const badPrefixes = [
    ["a wrong token", "wrong"],
    ["a token over 64 characters", "a".repeat(65)],
    ["the right token with a character more", `${TOKEN}x`],
  ]

  for (const [name, token] of badPrefixes) {
    it(`answers ${name} with the plain 404 on every method`, async () => {
      const before = await allRows()
      for (const res of [
        await req(leadsPath("", token)),
        await req(leadsPath("/c-new", token)),
        await send("PUT", leadsPath("/c-new", token), {
          status: "won",
          notes: "x",
        }),
        await req(leadsPath("/c-new", token), { method: "DELETE" }),
      ]) {
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual(notFoundBody)
      }
      expect(await allRows()).toEqual(before)
    })
  }

  it("answers an unknown or too-long id with the plain 404", async () => {
    const before = await allRows()
    for (const id of ["nope", "c".repeat(65)]) {
      for (const res of [
        await req(leadsPath(`/${id}`)),
        await send("PUT", leadsPath(`/${id}`), { status: "won", notes: "x" }),
        await req(leadsPath(`/${id}`), { method: "DELETE" }),
      ]) {
        expect(res.status, id).toBe(404)
        expect(await res.json()).toEqual(notFoundBody)
      }
    }
    expect(await allRows()).toEqual(before)
  })

  it("answers other methods with the plain 404", async () => {
    const before = await allRows()
    for (const [method, path] of [
      ["POST", leadsPath()],
      ["PUT", leadsPath()],
      ["DELETE", leadsPath()],
      ["POST", leadsPath("/c-new")],
      ["PATCH", leadsPath("/c-new")],
    ]) {
      const res = await req(path, { method, body: "{}" })
      expect(res.status, `${method} ${path}`).toBe(404)
      expect(await res.json()).toEqual(notFoundBody)
    }
    expect(await allRows()).toEqual(before)
  })
})

describe("leads response headers", () => {
  it("are on every response, 404s included", async () => {
    for (const res of [
      await req(leadsPath()),
      await req(leadsPath("/c-new")),
      await send("PUT", leadsPath("/c-new"), { status: "won", notes: "" }),
      await send("PUT", leadsPath("/c-new"), "not json"),
      await req(leadsPath("/nope")),
      await req(leadsPath("", "wrong")),
      await req(leadsPath("/c-new"), { method: "DELETE" }),
    ]) {
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow")
      expect(res.headers.get("Referrer-Policy")).toBe("no-referrer")
      expect(res.headers.get("Cache-Control")).toBe("no-store")
    }
  })
})

describe("GET /leads", () => {
  it("lists new leads first, each group newest first, without private fields", async () => {
    const res = await req(leadsPath())
    expect(res.status).toBe(200)
    const { leads } = await res.json<{ leads: Record<string, unknown>[] }>()
    expect(leads.map((lead) => lead.id)).toEqual([
      "e-new-latest",
      "c-new",
      "a-old-new",
      "b-won",
      "d-replied",
    ])
    for (const lead of leads) {
      expect(Object.keys(lead).sort()).toEqual([
        "company",
        "createdAt",
        "fromSection",
        "id",
        "intent",
        "name",
        "status",
      ])
    }
    expect(leads[1]).toEqual({
      id: "c-new",
      createdAt: "2026-11-15T12:00:00.000Z",
      intent: "hiring",
      name: "Name c-new",
      company: "Acme",
      fromSection: "numbers",
      status: "new",
    })
  })

  it("counts this month in New York and every status", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-21T15:00:00Z"))
    try {
      const { summary } = await (await req(leadsPath())).json<any>()
      // d-replied came in at 11:59 PM on Oct 31 in New York, so it is not this month.
      expect(summary).toEqual({
        thisMonth: 3,
        byStatus: { new: 3, replied: 1, "call-booked": 0, won: 1, lost: 0 },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("returns zeros with no leads", async () => {
    await env.DB.prepare("DELETE FROM leads").run()
    expect(await (await req(leadsPath())).json()).toEqual({
      summary: {
        thisMonth: 0,
        byStatus: { new: 0, replied: 0, "call-booked": 0, won: 0, lost: 0 },
      },
      leads: [],
    })
  })
})

describe("GET /leads/:id", () => {
  it("returns the full lead", async () => {
    const res = await req(leadsPath("/b-won"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: "b-won",
      createdAt: "2026-11-20T12:00:00.000Z",
      intent: "hiring",
      name: "Name b-won",
      company: null,
      fromSection: null,
      status: "won",
      email: "b-won@example.com",
      answers,
      notes: "Signed.",
    })
  })
})

describe("PUT /leads/:id", () => {
  const row = (id: string) =>
    env.DB.prepare("SELECT * FROM leads WHERE id = ?")
      .bind(id)
      .first<Record<string, unknown>>()

  it("changes only status and notes", async () => {
    const before = await row("c-new")
    const others = (await allRows()).filter((lead) => lead.id !== "c-new")
    const res = await send("PUT", leadsPath("/c-new"), {
      status: "replied",
      notes: "Sent times for Tuesday.",
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(await row("c-new")).toEqual({
      ...before,
      status: "replied",
      notes: "Sent times for Tuesday.",
    })
    expect((await allRows()).filter((lead) => lead.id !== "c-new")).toEqual(
      others,
    )
    const detail = await (await req(leadsPath("/c-new"))).json<any>()
    expect(detail.status).toBe("replied")
    expect(detail.notes).toBe("Sent times for Tuesday.")
  })

  it("saves notes of exactly the limit", async () => {
    const notes = "a".repeat(LEAD_LIMITS.notes)
    const res = await send("PUT", leadsPath("/c-new"), { status: "new", notes })
    expect(res.status).toBe(200)
    expect((await row("c-new"))?.notes).toBe(notes)
  })

  it("rejects bad bodies and writes nothing", async () => {
    const before = await allRows()
    const cases: [unknown, string[] | undefined][] = [
      [{ status: "open", notes: "" }, ["status"]],
      [{ status: "won", notes: 5 }, ["notes"]],
      [{ status: "won", notes: "a".repeat(LEAD_LIMITS.notes + 1) }, ["notes"]],
      [{ status: "won", notes: "", email: "x@example.com" }, ["email"]],
      ["not json", undefined],
      ["[]", undefined],
      ["null", undefined],
      ['"won"', undefined],
    ]
    for (const [body, fields] of cases) {
      const res = await send("PUT", leadsPath("/c-new"), body)
      expect(res.status).toBe(400)
      const json = await res.json<{ error: string; fields?: object }>()
      expect(json.error).toBe("invalid")
      if (fields) expect(Object.keys(json.fields ?? {})).toEqual(fields)
    }
    expect(await allRows()).toEqual(before)
  })

  it("rejects a body over the size cap, by actual and declared size", async () => {
    const before = await allRows()
    const big = await send("PUT", leadsPath("/c-new"), {
      status: "won",
      notes: "a".repeat(LEAD_LIMITS.body),
    })
    expect(big.status).toBe(413)
    expect(await big.json()).toEqual({ error: "too_large" })
    const declared = await send(
      "PUT",
      leadsPath("/c-new"),
      { status: "won", notes: "" },
      { "Content-Length": String(LEAD_LIMITS.body + 1) },
    )
    expect(declared.status).toBe(413)
    expect(await declared.json()).toEqual({ error: "too_large" })
    expect(await allRows()).toEqual(before)
  })
})

describe("DELETE /leads/:id", () => {
  it("removes the lead and its notes, and nothing else", async () => {
    const others = (await allRows()).filter((lead) => lead.id !== "b-won")
    const res = await req(leadsPath("/b-won"), { method: "DELETE" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(await allRows()).toEqual(others)
    const gone = await req(leadsPath("/b-won"))
    expect(gone.status).toBe(404)
    expect(await gone.json()).toEqual(notFoundBody)
  })
})

describe("database failures", () => {
  const breakLeads = () =>
    env.DB.prepare("ALTER TABLE leads RENAME TO leads_moved").run()
  const fixLeads = () =>
    env.DB.prepare("ALTER TABLE leads_moved RENAME TO leads").run()

  it("answer GET with load failed and PUT and DELETE with save failed, never with the token", async () => {
    const spies = (["log", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    const bodies: string[] = []
    await breakLeads()
    try {
      const expectError = async (res: Response, error: string) => {
        expect(res.status).toBe(500)
        const text = await res.text()
        bodies.push(text)
        expect(JSON.parse(text)).toEqual({ error })
      }
      await expectError(await req(leadsPath()), "load failed")
      await expectError(await req(leadsPath("/c-new")), "load failed")
      await expectError(
        await send("PUT", leadsPath("/c-new"), { status: "won", notes: "" }),
        "save failed",
      )
      await expectError(
        await req(leadsPath("/c-new"), { method: "DELETE" }),
        "save failed",
      )
      expect(spies[2]).toHaveBeenCalled()
      for (const spy of spies) {
        const logged = JSON.stringify(spy.mock.calls)
        expect(logged).not.toContain(TOKEN)
        expect(logged).not.toContain("/api/edit")
        expect(logged).not.toContain("c-new")
      }
      for (const body of bodies) expect(body).not.toContain(TOKEN)
    } finally {
      await fixLeads()
      vi.restoreAllMocks()
    }
  })
})
