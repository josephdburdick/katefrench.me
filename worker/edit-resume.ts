import { Hono } from "hono"

import {
  type ResumeContent,
  resumeFromStored,
  resumeToStored,
  validateResume,
} from "../src/lib/edit-resume"
import {
  type EditEnv,
  invalid,
  loadFailed,
  notFound,
  readBody,
  saveFailed,
} from "./edit"

const loadAttributes = (db: D1Database) =>
  db
    .prepare("SELECT attributes FROM content WHERE key = 'cv'")
    .first<{ attributes: string }>()

/** Mounted on the `edit` app, so the token check and the edit headers run first. */
export const editResume = new Hono<EditEnv>()

editResume.get("/", async (c) => {
  try {
    const row = await loadAttributes(c.env.DB)
    if (!row) return notFound(c)
    return c.json(resumeFromStored(JSON.parse(row.attributes)))
  } catch (err) {
    return loadFailed(c, err)
  }
})

editResume.put("/", async (c) => {
  const parsed = await readBody(c)
  if (!parsed.ok) return parsed.response

  const fields = validateResume(parsed.body)
  if (Object.keys(fields).length > 0) return invalid(c, fields)

  const updatedAt = new Date().toISOString()
  try {
    const row = await loadAttributes(c.env.DB)
    if (!row) return notFound(c)
    const attributes = {
      ...JSON.parse(row.attributes),
      sections: resumeToStored(parsed.body as ResumeContent),
    }
    await c.env.DB.prepare(
      "UPDATE content SET attributes = ?, updated_at = ? WHERE key = 'cv'",
    )
      .bind(JSON.stringify(attributes), updatedAt)
      .run()
  } catch (err) {
    return saveFailed(c, err)
  }
  return c.json({ ok: true, updatedAt })
})
