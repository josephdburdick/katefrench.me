import type { EditContent, EditErrors, SaveResponse } from "@/lib/edit-content"

export type LoadState<T = EditContent> =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | { status: "ready"; data: T }

const base = (token: string) => `/api/edit/${encodeURIComponent(token)}`

/** `path` is the part after the token, such as `/content`. */
export async function loadEdit<T>(
  token: string,
  path: string,
): Promise<LoadState<T>> {
  try {
    const res = await fetch(`${base(token)}${path}`, { cache: "no-store" })
    if (res.status === 404) return { status: "not-found" }
    if (!res.ok) return { status: "error" }
    return { status: "ready", data: (await res.json()) as T }
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

export async function deleteEdit(token: string, path: string) {
  try {
    const res = await fetch(`${base(token)}${path}`, { method: "DELETE" })
    return res.ok
  } catch {
    return false
  }
}
