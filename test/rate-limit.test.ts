import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import type { Env } from "../worker/env"
import { rateLimit } from "../worker/rate-limit"

const IP = "203.0.113.7"

function limiter(allowed: number) {
  const keys: string[] = []
  return {
    keys,
    limit: vi.fn(async ({ key }: { key: string }) => {
      keys.push(key)
      return { success: keys.length <= allowed }
    }),
  }
}

function setup(env: Partial<Env>) {
  const app = new Hono<{ Bindings: Env }>()
  app.use("/api/*", rateLimit)
  app.all("/api/*", (c) => c.json({ ok: true }))
  return (path: string, method = "GET", ip: string | null = IP) =>
    app.request(
      `https://katefrench.me${path}`,
      { method, headers: ip ? { "CF-Connecting-IP": ip } : {} },
      env as Env,
    )
}

describe("rateLimit", () => {
  it("counts posts per visitor and answers 429 busy past the limit", async () => {
    const submit = limiter(2)
    const read = limiter(100)
    const call = setup({ SUBMIT_LIMIT: submit, READ_LIMIT: read })

    expect((await call("/api/contact", "POST")).status).toBe(200)
    expect((await call("/api/booking/abc", "POST")).status).toBe(200)
    const res = await call("/api/contact", "POST")
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("60")
    expect(await res.json()).toEqual({ ok: false, error: "busy" })
    expect(submit.keys).toEqual([IP, IP, IP])
    expect(read.keys).toEqual([])
  })

  it("counts page loads on the read limit", async () => {
    const submit = limiter(100)
    const read = limiter(1)
    const call = setup({ SUBMIT_LIMIT: submit, READ_LIMIT: read })

    expect((await call("/api/availability")).status).toBe(200)
    expect((await call("/api/booking/abc")).status).toBe(429)
    expect(submit.keys).toEqual([])
  })

  it("leaves content and the edit screens alone", async () => {
    const none = limiter(0)
    const call = setup({ SUBMIT_LIMIT: none, READ_LIMIT: none })

    expect((await call("/api/content")).status).toBe(200)
    expect((await call("/api/edit/token/leads")).status).toBe(200)
    expect((await call("/api/edit/token/sections/intro", "PUT")).status).toBe(
      200,
    )
    expect(none.keys).toEqual([])
  })

  it("lets a request through with no address, no binding or a failing limiter", async () => {
    const none = limiter(0)
    expect(
      (await setup({ SUBMIT_LIMIT: none })("/api/contact", "POST", null))
        .status,
    ).toBe(200)
    expect((await setup({})("/api/contact", "POST")).status).toBe(200)
    const broken = {
      limit: vi.fn(async () => {
        throw new Error("down")
      }),
    }
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(
      (await setup({ SUBMIT_LIMIT: broken })("/api/contact", "POST")).status,
    ).toBe(200)
  })
})
