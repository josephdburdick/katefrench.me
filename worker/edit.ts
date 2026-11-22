import { type Context, Hono, type MiddlewareHandler } from "hono"

import {
  EDIT_LIMITS,
  type EditContent,
  type EditErrors,
  type NumbersRequest,
  SECTION_KEYS,
  type SectionKey,
  isSectionKey,
  numbersAttributes,
  validateNumbers,
  validateSection,
} from "../src/lib/edit-content"
import { hashEditToken, safeEqual } from "./edit-token"
import type { Env } from "./env"

type EditEnv = { Bindings: Env }

type Row = {
  key: string
  attributes: string
  body: string
  draft: number
  updated_at: string
}

const MAX_TOKEN_LENGTH = 64
const DEV_TOKEN = "dev-owner-token"

const notFound = (c: Context<EditEnv>) => c.json({ error: "not found" }, 404)

const errorCode = (err: unknown) =>
  String((err as { code?: unknown })?.code ?? "unknown")

/** Keeps every edit response, 404s included, out of search results, referrers and caches. */
export const editHeaders: MiddlewareHandler<EditEnv> = async (c, next) => {
  await next()
  c.header("X-Robots-Tag", "noindex, nofollow")
  c.header("Referrer-Policy", "no-referrer")
  c.header("Cache-Control", "no-store")
}

/** Every rejection is the same 404 as an unknown API path, so a wrong token learns nothing. */
export const requireEditToken: MiddlewareHandler<EditEnv> = async (c, next) => {
  const token = c.req.param("token") ?? ""
  if (!token || token.length > MAX_TOKEN_LENGTH) return notFound(c)
  if (c.env.LOCAL_SERVICES === "1" && safeEqual(token, DEV_TOKEN)) {
    return next()
  }
  let stored: { token_hash: string } | null
  try {
    stored = await c.env.DB.prepare(
      "SELECT token_hash FROM edit_token WHERE id = 1",
    ).first<{ token_hash: string }>()
  } catch (err) {
    console.error("edit: token check failed", errorCode(err))
    return c.json(
      { error: c.req.method === "GET" ? "load failed" : "save failed" },
      500,
    )
  }
  if (!stored || !safeEqual(await hashEditToken(token), stored.token_hash)) {
    return notFound(c)
  }
  await next()
}

type Parsed =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response }

async function readBody(c: Context<EditEnv>): Promise<Parsed> {
  const tooLarge = () => ({
    ok: false as const,
    response: c.json({ error: "too_large" }, 413),
  })
  const declared = Number(c.req.header("Content-Length") ?? 0)
  if (declared > EDIT_LIMITS.body) return tooLarge()
  const raw = await c.req.arrayBuffer()
  if (raw.byteLength > EDIT_LIMITS.body) return tooLarge()
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(raw))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object")
    }
    return { ok: true, body: parsed as Record<string, unknown> }
  } catch {
    return { ok: false, response: c.json({ error: "invalid" }, 400) }
  }
}

const invalid = (c: Context<EditEnv>, fields: EditErrors) =>
  c.json({ error: "invalid", fields }, 400)

const saveFailed = (c: Context<EditEnv>, err: unknown) => {
  console.error("edit: save failed", errorCode(err))
  return c.json({ error: "save failed" }, 500)
}

const loadRow = (db: D1Database, key: SectionKey) =>
  db
    .prepare(
      "SELECT key, attributes, body, draft, updated_at FROM content WHERE key = ?",
    )
    .bind(key)
    .first<Row>()

export const edit = new Hono<EditEnv>()

edit.use("*", editHeaders)
edit.use("*", requireEditToken)

edit.get("/content", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT key, attributes, body, draft, updated_at FROM content WHERE key IN (${SECTION_KEYS.map(() => "?").join(", ")})`,
    )
      .bind(...SECTION_KEYS)
      .all<Row>()
    const data: EditContent = {}
    for (const key of SECTION_KEYS) {
      const row = results.find((r) => r.key === key)
      if (!row) continue
      data[key] = {
        attributes: JSON.parse(row.attributes),
        body: row.body,
        draft: row.draft === 1,
        updatedAt: row.updated_at,
      }
    }
    return c.json(data)
  } catch (err) {
    console.error("edit: load failed", errorCode(err))
    return c.json({ error: "load failed" }, 500)
  }
})

edit.put("/numbers", async (c) => {
  const parsed = await readBody(c)
  if (!parsed.ok) return parsed.response
  const { body } = parsed

  let row: Row | null
  try {
    row = await loadRow(c.env.DB, "numbers")
  } catch (err) {
    return saveFailed(c, err)
  }
  if (!row) return notFound(c)

  const stored = JSON.parse(row.attributes)
  const fields = validateNumbers(body, stored)
  if (Object.keys(fields).length > 0) return invalid(c, fields)

  const request = body as NumbersRequest
  const updatedAt = new Date().toISOString()
  try {
    await c.env.DB.prepare(
      "UPDATE content SET attributes = ?, draft = ?, updated_at = ? WHERE key = 'numbers'",
    )
      .bind(
        JSON.stringify(numbersAttributes(request, stored)),
        request.draft ? 1 : 0,
        updatedAt,
      )
      .run()
  } catch (err) {
    return saveFailed(c, err)
  }
  return c.json({ ok: true, updatedAt })
})

edit.put("/sections/:key", async (c) => {
  const key = c.req.param("key")
  if (!isSectionKey(key) || key === "numbers") return notFound(c)

  const parsed = await readBody(c)
  if (!parsed.ok) return parsed.response
  const { body } = parsed

  let row: Row | null
  try {
    row = await loadRow(c.env.DB, key)
  } catch (err) {
    return saveFailed(c, err)
  }
  if (!row) return notFound(c)

  const fields = validateSection(key, body, {
    attributes: JSON.parse(row.attributes),
  })
  if (Object.keys(fields).length > 0) return invalid(c, fields)

  const updatedAt = new Date().toISOString()
  try {
    await c.env.DB.prepare(
      "UPDATE content SET attributes = ?, body = ?, draft = ?, updated_at = ? WHERE key = ?",
    )
      .bind(
        JSON.stringify(body.attributes),
        body.body as string,
        body.draft ? 1 : 0,
        updatedAt,
        key,
      )
      .run()
  } catch (err) {
    return saveFailed(c, err)
  }
  return c.json({ ok: true, updatedAt })
})
