import { localCalendar } from "./calendar"
import type { ContactServices } from "./contact"
import { cloudflareEmail, localEmail } from "./email"
import type { Env } from "./env"
import { localTurnstile, siteverify } from "./turnstile"

const local: ContactServices = {
  email: localEmail(),
  turnstile: localTurnstile(),
  calendar: localCalendar(),
}

export function servicesFor(env: Env): ContactServices {
  if (env.LOCAL_SERVICES === "1") return local
  return {
    email: cloudflareEmail(env.EMAIL),
    turnstile: siteverify(env.TURNSTILE_SECRET),
    calendar: null,
  }
}
