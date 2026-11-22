import type { ContentRow } from "./seed-data.ts"

// Just the parts of D1 the seed uses, so the same writer runs in Node (through
// wrangler's platform proxy) and in the Workers test runtime.
interface Statement {
  bind(...values: unknown[]): Statement
}

export interface SeedBindings {
  DB: {
    prepare(query: string): Statement
    batch(statements: Statement[]): Promise<unknown>
  }
}

/** Replaces every `content` row with `rows` in one batch. Returns how many rows it wrote. */
export async function seedContent(
  { DB }: SeedBindings,
  rows: ContentRow[],
): Promise<number> {
  const updatedAt = new Date().toISOString()
  await DB.batch([
    DB.prepare("DELETE FROM content"),
    ...rows.map((row) =>
      DB.prepare(
        "INSERT INTO content (key, attributes, body, draft, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(row.key, row.attributes, row.body, row.draft, updatedAt),
    ),
  ])
  return rows.length
}
