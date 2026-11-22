const ORIGINS = ["https://katefrench.me", "https://www.katefrench.me"]

// Same-origin also covers local development, where the page and the Worker share a host.
export function originAllowed(request: Request) {
  const origin = request.headers.get("Origin")
  if (!origin) return false
  return ORIGINS.includes(origin) || origin === new URL(request.url).origin
}
