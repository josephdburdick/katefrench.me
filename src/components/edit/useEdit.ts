import type { EditErrors } from "@/lib/edit-content"
import { useEffect, useState } from "react"

import { type LoadState, loadEditContent, saveEdit } from "./api"

export function useEditContent(token: string) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: "loading" })

  useEffect(() => {
    let active = true
    loadEditContent(token).then((result) => active && setState(result))
    return () => {
      active = false
    }
  }, [token, attempt])

  const retry = () => {
    setState({ status: "loading" })
    setAttempt((n) => n + 1)
  }

  return { state, retry }
}

export type SaveStatus = "idle" | "saving" | "saved" | "invalid" | "failed"

export function useSave(token: string, path: string) {
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [errors, setErrors] = useState<EditErrors>({})

  /** Runs `checked` (the shared validator's result) first, so a bad value never leaves the phone. */
  async function save(body: unknown, checked: EditErrors) {
    if (status === "saving") return false
    if (Object.keys(checked).length > 0) {
      setErrors(checked)
      setStatus("invalid")
      return false
    }
    setErrors({})
    setStatus("saving")
    const result = await saveEdit(token, path, body)
    if (result.ok) {
      setStatus("saved")
      return true
    }
    setErrors(result.fields ?? {})
    setStatus(result.fields ? "invalid" : "failed")
    return false
  }

  const changed = () => setStatus((s) => (s === "saved" ? "idle" : s))

  return { status, errors, save, changed }
}
