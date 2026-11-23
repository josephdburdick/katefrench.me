import {
  type Answers,
  type Availability,
  type Errors,
  type Field,
  type Intent,
  LINK_DETAILS,
  NO_CALL,
  type Source,
  emptyAnswers,
  firstStepWithError,
  stepsFor,
  validateStep,
  withIntent,
} from "@/lib/contact-form"
import { useCallback, useEffect, useRef, useState } from "react"

import { loadAvailability, submitContact } from "./submit"

export type Failure = "turnstile" | "send" | null

type TextField = "message" | "name" | "email" | "company"

export type Prefill = { intent: Intent | null; from: Source | null }

export default function useContactForm({ intent, from }: Prefill) {
  const [answers, setAnswers] = useState<Answers>(() =>
    intent
      ? {
          ...withIntent(emptyAnswers(), intent),
          details: { ...LINK_DETAILS[intent] },
        }
      : emptyAnswers(),
  )
  const [stepIndex, setStepIndex] = useState(intent ? 1 : 0)
  const [errors, setErrors] = useState<Errors>({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState<Failure>(null)
  const [token, setToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0)
  const [errorFocus, setErrorFocus] = useState(0)
  const [availability, setAvailability] = useState<Availability | "loading">(
    "loading",
  )
  const inFlight = useRef(false)
  const trap = useRef<HTMLInputElement>(null)

  const showTimes = useCallback((result: Availability | null) => {
    const offer = result ?? { times: [], minutes: 0 }
    setAvailability(offer)
    if (offer.times.length === 0) {
      setAnswers((current) =>
        current.time === "" ? { ...current, time: NO_CALL } : current,
      )
    }
  }, [])

  useEffect(() => {
    void loadAvailability().then(showTimes)
  }, [showTimes])

  function reloadTimes() {
    setAvailability("loading")
    void loadAvailability().then(showTimes)
  }

  const steps = stepsFor(answers.intent)
  const step = steps[stepIndex]
  const last = stepIndex === steps.length - 1

  function clearError(field: Field) {
    setErrors((current) => {
      const rest = { ...current }
      delete rest[field]
      return rest
    })
  }

  function update(field: TextField) {
    return (value: string) => {
      setAnswers((current) => ({ ...current, [field]: value }))
      clearError(field)
    }
  }

  function pickIntent(intent: Intent) {
    setAnswers((current) => withIntent(current, intent))
    setErrors({})
  }

  function pickDetail(key: string, value: string) {
    setAnswers((current) => ({
      ...current,
      details: { ...current.details, [key]: value },
    }))
    clearError("details")
  }

  function pickTime(time: string) {
    setAnswers((current) => ({ ...current, time }))
    clearError("time")
  }

  function back() {
    setErrors({})
    setFailure(null)
    setStepIndex((index) => Math.max(0, index - 1))
  }

  async function send() {
    if (inFlight.current || !token) return
    inFlight.current = true
    setSending(true)
    setFailure(null)
    const result = await submitContact({
      answers,
      token,
      website: trap.current?.value ?? "",
      from,
    })
    inFlight.current = false
    setSending(false)
    if (result.ok) {
      setSent(true)
      return
    }

    // Turnstile tokens are single-use, so any failed attempt needs a new one.
    setToken(null)
    setTurnstileKey((key) => key + 1)

    if (result.error === "invalid" && result.fields) {
      const fields = result.fields
      if (fields.time) {
        setAnswers((current) => ({ ...current, time: "" }))
        reloadTimes()
      }
      setErrors(fields)
      setErrorFocus((n) => n + 1)
      const first = firstStepWithError(steps, fields)
      if (first > -1) setStepIndex(first)
      return
    }
    setFailure(result.error === "turnstile" ? "turnstile" : "send")
  }

  async function next() {
    const stepErrors = validateStep(step, answers)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      setErrorFocus((n) => n + 1)
      return
    }
    setErrors({})
    if (!last) {
      setStepIndex(stepIndex + 1)
      return
    }
    await send()
  }

  return {
    answers,
    availability,
    steps,
    step,
    stepIndex,
    last,
    errors,
    sending,
    sent,
    failure,
    token,
    turnstileKey,
    errorFocus,
    trap,
    setToken,
    update,
    pickIntent,
    pickDetail,
    pickTime,
    back,
    next,
  }
}
