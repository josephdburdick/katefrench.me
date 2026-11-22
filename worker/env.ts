export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  EMAIL: SendEmail
  CONTACT_TO: string
  TURNSTILE_SECRET: string
  /** "1" swaps email and Turnstile for local stand-ins that never call out. */
  LOCAL_SERVICES?: string
}
