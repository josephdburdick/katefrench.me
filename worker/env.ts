export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  EMAIL: SendEmail
  CONTACT_TO: string
  TURNSTILE_SECRET: string
  /** "1" swaps email, Turnstile and the calendar for local stand-ins that never call out. */
  LOCAL_SERVICES?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_REFRESH_TOKEN?: string
}
