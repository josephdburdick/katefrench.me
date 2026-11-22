import { env } from "cloudflare:workers"

import about from "../content/about.md?raw"
import acrossCompany from "../content/across-company.md?raw"
import closing from "../content/closing.md?raw"
import contact from "../content/contact.md?raw"
import cv from "../content/cv.md?raw"
import experience from "../content/experience.md?raw"
import firstCall from "../content/first-call.md?raw"
import intro from "../content/intro.md?raw"
import marketing from "../content/marketing.md?raw"
import message from "../content/message.md?raw"
import newYork from "../content/new-york.md?raw"
import numbers from "../content/numbers.md?raw"
import site from "../content/site.md?raw"
import venues from "../content/venues.md?raw"
import { contentRows } from "../scripts/seed-data.ts"
import { seedContent } from "../scripts/seed-write.ts"

export const files = {
  about,
  "across-company": acrossCompany,
  closing,
  contact,
  cv,
  experience,
  "first-call": firstCall,
  intro,
  marketing,
  message,
  "new-york": newYork,
  numbers,
  site,
  venues,
}

export const keys = Object.keys(files).sort()

export const draftKeys = ["closing", "first-call", "marketing", "message"]

export const seed = () => seedContent(env, contentRows(files))
