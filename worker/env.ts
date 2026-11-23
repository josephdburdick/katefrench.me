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
  /** Comma-separated IDs of extra calendars to read busy times from, such as a work calendar shared with the account. */
  GOOGLE_BUSY_CALENDARS?: string
  /** Per visitor, per minute: form posts and booking answers. */
  SUBMIT_LIMIT?: RateLimit
  /** Per visitor, per minute: availability and booking page loads. */
  READ_LIMIT?: RateLimit
}
