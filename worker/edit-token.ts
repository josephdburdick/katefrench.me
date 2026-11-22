/** Kate's edit link token. Plain Web Crypto, so `scripts/edit-link-local.ts` can import it as well as the Worker. */

/** A new token: 32 random bytes as base64url without padding, 43 characters. */
export function generateEditToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

/** The lowercase hex SHA-256 of the token, which is all the database keeps. */
export async function hashEditToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  )
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")
}

/** Constant-time string comparison, so token checks don't leak length or prefix timing. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

// Just the parts of D1 the writer uses, so it runs in Node (through wrangler's
// platform proxy) and in the Workers test runtime.
interface Statement {
  bind(...values: unknown[]): Statement
  run(): Promise<unknown>
}

export interface EditTokenBindings {
  DB: { prepare(query: string): Statement }
}

/** Stores the hash of `token` as the only edit token, so any earlier link stops working. */
export async function replaceEditToken(
  { DB }: EditTokenBindings,
  token: string,
): Promise<void> {
  await DB.prepare(
    "INSERT INTO edit_token (id, token_hash, created_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at",
  )
    .bind(await hashEditToken(token), new Date().toISOString())
    .run()
}
