import { getPlatformProxy } from "wrangler"

import {
  type EditTokenBindings,
  generateEditToken,
  replaceEditToken,
} from "../worker/edit-token.ts"
import { assertLocalOnly } from "./seed-guard.ts"

/** `pnpm edit-link:local`: makes a new edit link for the local D1 that `pnpm dev` uses and prints its path. */

try {
  assertLocalOnly("edit-link:local", process.argv.slice(2))
} catch (err) {
  console.error((err as Error).message)
  process.exit(1)
}

const token = generateEditToken()
const proxy = await getPlatformProxy<EditTokenBindings>({
  remoteBindings: false,
})
try {
  await replaceEditToken(proxy.env, token)
} finally {
  await proxy.dispose()
}
console.log(`/edit/${token}`)
console.log("The old edit link no longer works.")
