import type { EditContent, EditErrors, SaveResponse } from "@/lib/edit-content"

export type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | { status: "ready"; data: EditContent }

const base = (token: string) => `/api/edit/${encodeURIComponent(token)}`

export async function loadEditContent(token: string): Promise<LoadState> {
  try {
    const res = await fetch(`${base(token)}/content`, { cache: "no-store" })
    if (res.status === 404) return { status: "not-found" }
    if (!res.ok) return { status: "error" }
    return { status: "ready", data: (await res.json()) as EditContent }
  } catch {
    return { status: "error" }
  }
}

export type SaveResult = { ok: true } | { ok: false; fields?: EditErrors }

/** `path` is the part after the token, such as `/numbers`. */
export async function saveEdit(
  token: string,
  path: string,
  body: unknown,
): Promise<SaveResult> {
  try {
    const res = await fetch(`${base(token)}${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const result = (await res.json()) as SaveResponse
    if ("ok" in result && result.ok) return { ok: true }
    return {
      ok: false,
      fields: "fields" in result ? result.fields : undefined,
    }
  } catch {
    return { ok: false }
  }
}
