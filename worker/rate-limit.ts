import type { MiddlewareHandler } from "hono"

import type { Env } from "./env"

const UNLIMITED = ["/api/content", "/api/edit"]

/**
 * Limits each visitor's calls to the public form, booking and availability routes.
 * It skips a request with no `CF-Connecting-IP`, which Cloudflare sets on every real one,
 * and lets the request through when the limiter itself fails. The address is never stored.
 */
export const rateLimit: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next,
) => {
  const { pathname } = new URL(c.req.url)
  if (UNLIMITED.some((path) => pathname.startsWith(path))) return next()

  const read = c.req.method === "GET" || c.req.method === "HEAD"
  const limiter = read ? c.env.READ_LIMIT : c.env.SUBMIT_LIMIT
  const ip = c.req.header("CF-Connecting-IP")
  if (!limiter || !ip) return next()

  let allowed = true
  try {
    allowed = (await limiter.limit({ key: ip })).success
  } catch {
    console.error("rate limit: check failed")
  }
  if (allowed) return next()
  return c.json({ ok: false, error: "busy" }, 429, { "Retry-After": "60" })
}
