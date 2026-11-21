import { readFile, readdir } from "node:fs/promises"
import { basename, join } from "node:path"
import { getPlatformProxy } from "wrangler"

import { contentRows } from "./seed-data.ts"
import { assertLocalOnly } from "./seed-guard.ts"
import { type SeedBindings, seedContent } from "./seed-write.ts"

/** `pnpm seed:local`: replaces the local D1 content that `pnpm dev` uses with `content/*.md`. */

try {
  assertLocalOnly(process.argv.slice(2))
} catch (err) {
  console.error((err as Error).message)
  process.exit(1)
}

const dir = join(import.meta.dirname, "..", "content")
const files: Record<string, string> = {}
for (const name of await readdir(dir)) {
  if (name.endsWith(".md"))
    files[basename(name, ".md")] = await readFile(join(dir, name), "utf8")
}

const proxy = await getPlatformProxy<SeedBindings>({ remoteBindings: false })
try {
  const count = await seedContent(proxy.env, contentRows(files))
  console.log(`Seeded ${count} content rows into the local database.`)
} finally {
  await proxy.dispose()
}
