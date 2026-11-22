import type { ContactRequest, ContactResponse } from "@/lib/contact-form"

export type SubmitResult =
  | { ok: true }
  | Extract<ContactResponse, { ok: false }>
  | { ok: false; error: "network" }

export async function submitContact(
  body: ContactRequest,
): Promise<SubmitResult> {
  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const result = (await response.json()) as ContactResponse
    return result.ok ? { ok: true } : result
  } catch {
    return { ok: false, error: "network" }
  }
}
