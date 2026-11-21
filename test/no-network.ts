import { vi } from "vitest"

/** Default `fetch` for every test: no real network, every request fails. */
export const offlineFetch = async () =>
  new Response("offline in tests", { status: 503 })

vi.stubGlobal("fetch", vi.fn(offlineFetch))
