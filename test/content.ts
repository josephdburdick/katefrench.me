import { env } from "cloudflare:workers"

import about from "../content/about.md?raw"
import contact from "../content/contact.md?raw"
import cv from "../content/cv.md?raw"
import experience from "../content/experience.md?raw"
import intro from "../content/intro.md?raw"
import site from "../content/site.md?raw"
import { contentRows } from "../scripts/seed-data.ts"
import { seedContent } from "../scripts/seed-write.ts"

export const files = { about, contact, cv, experience, intro, site }

export const seed = () => seedContent(env, contentRows(files))
