import { exports } from "cloudflare:workers"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import { LIMITS, SENDER } from "../src/lib/contact-form"
import { contactApp } from "../worker/contact"
import {
  type EmailMessage,
  type EmailSender,
  cloudflareEmail,
  localEmail,
} from "../worker/email"
import type { Env } from "../worker/env"
import { DUMMY_TOKEN, localTurnstile, siteverify } from "../worker/turnstile"

const URL = "https://katefrench.me/api/contact"
const env = { CONTACT_TO: "kate@example.com" } as Env

const answers = {
  intent: "hiring",
  details: { role: "Sales", location: "New York", start: "Right away" },
  message: "We need someone to open New York.",
  name: "Sam Lee",
  email: "sam@example.com",
  company: "Acme",
}

const valid = { answers, token: DUMMY_TOKEN, website: "" }

function setup(
  email: EmailSender = localEmail(),
  overrides: Partial<Env> = {},
) {
  const turnstile = localTurnstile()
  const verify = vi.spyOn(turnstile, "verify")
  const app = new Hono<{ Bindings: Env }>().route(
    "/api/contact",
    contactApp({ email, turnstile }),
  )
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request(
      URL,
      {
        method: "POST",
        headers: {
          Origin: "https://katefrench.me",
          "Content-Type": "application/json",
          ...headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
      { ...env, ...overrides },
    )
  return { app, post, verify }
}

describe("POST /api/contact", () => {
  it("answers anything but POST with 405", async () => {
    const { app } = setup()
    const res = await app.request(URL, {}, env)
    expect(res.status).toBe(405)
    expect(res.headers.get("Allow")).toBe("POST")
  })

  it("refuses a foreign or missing Origin", async () => {
    const email = localEmail()
    const { app, post } = setup(email)
    const evil = await post(valid, { Origin: "https://evil.example" })
    expect(evil.status).toBe(403)
    expect(await evil.json()).toEqual({ ok: false, error: "origin" })

    const none = await app.request(
      URL,
      { method: "POST", body: JSON.stringify(valid) },
      env,
    )
    expect(none.status).toBe(403)
    expect(await none.json()).toEqual({ ok: false, error: "origin" })
    expect(email.sent).toEqual([])
  })

  it("accepts the www host and the request's own origin", async () => {
    const { post } = setup()
    expect(
      (await post(valid, { Origin: "https://www.katefrench.me" })).status,
    ).toBe(200)
    const { app } = setup()
    const res = await app.request(
      "http://localhost:5120/api/contact",
      {
        method: "POST",
        headers: { Origin: "http://localhost:5120" },
        body: JSON.stringify(valid),
      },
      env,
    )
    expect(res.status).toBe(200)
  })

  it("refuses a body over the limit, by declared and actual size", async () => {
    const email = localEmail()
    const { post } = setup(email)
    const big = await post({ ...valid, padding: "a".repeat(LIMITS.body) })
    expect(big.status).toBe(413)
    expect(await big.json()).toEqual({ ok: false, error: "too_large" })

    const declared = await post(valid, {
      "Content-Length": String(LIMITS.body + 1),
    })
    expect(declared.status).toBe(413)
    expect(email.sent).toEqual([])
  })

  it("fits every field at its limit in 4-byte characters", async () => {
    const wide = (n: number) => "😀".repeat(n / 2)
    const { post } = setup()
    const res = await post({
      answers: {
        ...answers,
        message: wide(LIMITS.message),
        name: wide(LIMITS.name),
        company: wide(LIMITS.company),
      },
      token: "x".repeat(2048),
      website: "",
    })
    expect(res.status).not.toBe(413)
  })

  it("refuses a body that is not a JSON object", async () => {
    const { post } = setup()
    for (const body of ["not json", "[]", "null", '"text"']) {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ ok: false, error: "invalid" })
    }
  })

  it("answers a filled trap field with ok and sends nothing", async () => {
    const email = localEmail()
    const { post, verify } = setup(email)
    const res = await post({ ...valid, website: "https://spam.example" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(email.sent).toEqual([])
    expect(verify).not.toHaveBeenCalled()
  })

  it("refuses a missing or wrong Turnstile token", async () => {
    const email = localEmail()
    const { post } = setup(email)
    for (const token of [undefined, "", "wrong-token"]) {
      const res = await post({ ...valid, token })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ ok: false, error: "turnstile" })
    }
    expect(email.sent).toEqual([])
  })

  it("refuses answers that fail the checks, with the field", async () => {
    const email = localEmail()
    const { post } = setup(email)
    const cases: [Record<string, unknown>, string][] = [
      [{ message: "a".repeat(LIMITS.message + 1) }, "message"],
      [{ name: "a".repeat(LIMITS.name + 1) }, "name"],
      [{ email: "not-an-email" }, "email"],
      [{ details: { ...answers.details, role: "Chef" } }, "details"],
    ]
    for (const [change, field] of cases) {
      const res = await post({ ...valid, answers: { ...answers, ...change } })
      expect(res.status).toBe(400)
      const body = await res.json<{ error: string; fields: object }>()
      expect(body.error).toBe("invalid")
      expect(Object.keys(body.fields)).toContain(field)
    }
    expect(email.sent).toEqual([])
  })

  it("answers a failing sender with 502 send, without logging the answers", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const { post } = setup({
      send: async () => {
        throw new Error(`could not send ${answers.message}`)
      },
    })
    const res = await post(valid)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, error: "send" })
    expect(JSON.stringify(log.mock.calls)).not.toContain(answers.message)
    expect(JSON.stringify(log.mock.calls)).not.toContain(answers.email)
    log.mockRestore()
  })

  it("answers an unset CONTACT_TO with 502 send", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {})
    const email = localEmail()
    const { post } = setup(email, { CONTACT_TO: "" })
    const res = await post(valid)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, error: "send" })
    expect(email.sent).toEqual([])
  })

  it("sends one email for a valid hiring submission", async () => {
    const email = localEmail()
    const { post } = setup(email)
    const res = await post(valid)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(email.sent).toHaveLength(1)
    const [message] = email.sent
    expect(message.to).toBe("kate@example.com")
    expect(message.from).toEqual(SENDER)
    expect(message.replyTo).toEqual({
      email: "sam@example.com",
      name: "Sam Lee",
    })
    expect(message.subject).toBe("[katefrench.me] Hiring · Sales · New York")
  })

  it("never takes the recipient from the body", async () => {
    const email = localEmail()
    const { post } = setup(email)
    await post({
      ...valid,
      to: "evil@example.com",
      CONTACT_TO: "evil@example.com",
      answers: { ...answers, to: "evil@example.com" },
    })
    expect(email.sent.map((m) => m.to)).toEqual(["kate@example.com"])
  })
})

describe("the mounted route", () => {
  it("runs through the Worker with the local stand-ins", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const res = await exports.default.fetch(
      new Request("https://example.com/api/contact", {
        method: "POST",
        headers: { Origin: "https://example.com" },
        body: JSON.stringify(valid),
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(JSON.stringify(log.mock.calls)).toContain(
      "[katefrench.me] Hiring · Sales · New York",
    )
    log.mockRestore()

    const get = await exports.default.fetch(
      new Request("https://example.com/api/contact"),
    )
    expect(get.status).toBe(405)
  })
})

describe("siteverify", () => {
  it("posts the secret, token and IP and reads success", async () => {
    const fake = vi.fn(async () => Response.json({ success: true }))
    const ok = await siteverify("secret", fake as typeof fetch).verify(
      "token",
      "203.0.113.7",
    )
    expect(ok).toBe(true)
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    )
    const form = init.body as FormData
    expect(form.get("secret")).toBe("secret")
    expect(form.get("response")).toBe("token")
    expect(form.get("remoteip")).toBe("203.0.113.7")
  })

  it("returns false on a failed check or any error", async () => {
    const no = vi.fn(async () => Response.json({ success: false }))
    expect(await siteverify("s", no as typeof fetch).verify("t")).toBe(false)
    const truthy = vi.fn(async () => Response.json({ success: "yes" }))
    expect(await siteverify("s", truthy as typeof fetch).verify("t")).toBe(
      false,
    )
    const broken = vi.fn(async () => {
      throw new Error("down")
    })
    expect(await siteverify("s", broken as typeof fetch).verify("t")).toBe(
      false,
    )
    expect(await siteverify("s").verify("t")).toBe(false)
  })
})

describe("localTurnstile", () => {
  it("accepts only the dummy token", async () => {
    const turnstile = localTurnstile()
    expect(await turnstile.verify(DUMMY_TOKEN)).toBe(true)
    expect(await turnstile.verify("anything else")).toBe(false)
  })
})

describe("cloudflareEmail", () => {
  it("hands the message to the send_email binding", async () => {
    const send = vi.fn(async () => ({ messageId: "1" }))
    const message: EmailMessage = {
      from: SENDER,
      to: "kate@example.com",
      replyTo: { email: "sam@example.com", name: "Sam" },
      subject: "Hi",
      text: "Hello",
    }
    await cloudflareEmail({ send } as unknown as SendEmail).send(message)
    expect(send).toHaveBeenCalledWith(message)
  })

  it("passes a send failure on", async () => {
    const send = vi.fn(async () => {
      throw new Error("no")
    })
    await expect(
      cloudflareEmail({ send } as unknown as SendEmail).send(
        {} as EmailMessage,
      ),
    ).rejects.toThrow("no")
  })
})
