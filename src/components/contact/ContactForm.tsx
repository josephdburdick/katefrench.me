import SiteLink from "@/components/global/SiteLink"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  type Answers,
  type Availability,
  FIELD_LABELS,
  type Field,
  INTENTS,
  LIMITS,
  NO_CALL,
  NO_CALL_LABEL,
  PRIVACY_NOTE,
  STEP_HEADINGS,
  formatCallTime,
  groupsFor,
  hasCallTime,
  intentOption,
  isIntent,
  stepLabel,
} from "@/lib/contact-form"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"

import Turnstile from "./Turnstile"
import useContactForm, { type Prefill } from "./useContactForm"

const FIELD_ORDER: Field[] = [
  "intent",
  "details",
  "message",
  "time",
  "name",
  "email",
  "company",
]

const errorId = (field: Field) => `contact-${field}-error`

const inputClass =
  "w-full min-w-0 rounded-md border border-primary/30 bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-foreground"

function FieldError({ field, message }: { field: Field; message?: string }) {
  if (!message) return null
  return (
    <p id={errorId(field)} role="alert" className="text-sm font-semibold">
      {message}
    </p>
  )
}

function Choices({
  name,
  legend,
  options,
  value,
  onPick,
  error,
  errorField,
  row,
}: {
  name: string
  legend: string
  options: { value: string; label: string }[]
  value: string | undefined
  onPick: (value: string) => void
  error?: string
  errorField: Field
  row?: boolean
}) {
  const invalid = Boolean(error) && !value
  return (
    <fieldset
      className="flex min-w-0 flex-col gap-2"
      aria-describedby={invalid ? errorId(errorField) : undefined}
      aria-invalid={invalid || undefined}
    >
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className={cn("flex gap-2", row ? "flex-wrap" : "flex-col")}>
        {options.map((option) => (
          <label
            key={option.value}
            className="border-primary/30 bg-background hover:border-primary hover:not-has-[:checked]:bg-primary/15 has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-foreground has-[:focus-visible]:ring-offset-secondary cursor-pointer rounded-lg border px-3.5 py-2.5 text-[0.9375rem] transition-colors has-[:checked]:font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onPick(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function TextField({
  field,
  label,
  optional,
  error,
  multiline,
  value,
  onChange,
  type = "text",
  autoComplete,
  maxLength,
}: {
  field: Field
  label: string
  optional?: boolean
  error?: string
  multiline?: boolean
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  maxLength: number
}) {
  const shared = {
    id: `contact-${field}`,
    value,
    maxLength,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId(field) : undefined,
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={shared.id} className="text-sm font-semibold">
        {label}
        {optional && <span className="font-normal"> (optional)</span>}
      </label>
      {multiline ? (
        <textarea
          {...shared}
          rows={6}
          className={cn(inputClass, "min-h-28 resize-y")}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...shared}
          type={type}
          autoComplete={autoComplete}
          className={inputClass}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <FieldError field={field} message={error} />
    </div>
  )
}

function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <a className="font-semibold break-all underline" href={`mailto:${email}`}>
        {email}
      </a>
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        Copy
      </Button>
      <span aria-live="polite" className="text-sm">
        {copied ? "Copied." : ""}
      </span>
    </span>
  )
}

function Failure({
  failure,
  email,
}: {
  failure: "turnstile" | "send" | "busy"
  email?: string
}) {
  return (
    <div
      role="alert"
      className="border-primary/30 bg-background flex flex-col gap-2 rounded-lg border px-4 py-3 text-[0.9375rem]"
    >
      {failure === "turnstile" ? (
        <p className="font-semibold">
          The spam check didn&rsquo;t finish. Wait a moment, then press Send
          again.
        </p>
      ) : failure === "busy" ? (
        <p className="font-semibold">
          Too many messages came in at once, so this one didn&rsquo;t send. Wait
          a minute, then press Send again.
        </p>
      ) : email ? (
        <>
          <p className="font-semibold">
            That didn&rsquo;t send. Please email me instead.
          </p>
          <CopyEmail email={email} />
        </>
      ) : (
        <p className="font-semibold">
          Something went wrong. Please try again in a few minutes.
        </p>
      )}
    </div>
  )
}

const visitorZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

function dayKey(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
}

function CallStep({
  answers,
  availability,
  error,
  onPick,
}: {
  answers: Answers
  availability: Availability | "loading"
  error?: string
  onPick: (time: string) => void
}) {
  const zone = visitorZone()
  const [day, setDay] = useState(() =>
    hasCallTime(answers) ? dayKey(answers.time, zone) : "",
  )
  const loading = availability === "loading"
  const { times, minutes } = loading ? { times: [], minutes: 0 } : availability

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  })
  const days = new Map<string, string>()
  for (const time of times) {
    const key = dayKey(time, zone)
    if (!days.has(key)) days.set(key, dayLabel.format(new Date(time)))
  }
  const onDay = times.filter((time) => dayKey(time, zone) === day)
  const noCall = [{ value: NO_CALL, label: NO_CALL_LABEL }]

  return (
    <>
      {loading && <p aria-live="polite">Loading open times…</p>}
      {!loading && times.length === 0 && (
        <p>There are no open times right now, so I&rsquo;ll reply by email.</p>
      )}
      {times.length > 0 && (
        <>
          <p className="text-[0.9375rem]">
            Calls are {minutes} minutes, by video. Times are in your time zone,{" "}
            {zone}.
          </p>
          <Choices
            name="call-day"
            legend="Pick a day"
            options={[...days].map(([value, label]) => ({ value, label }))}
            value={day || undefined}
            onPick={setDay}
            error={error}
            errorField="time"
            row
          />
          {onDay.length > 0 && (
            <Choices
              name="time"
              legend={`Times on ${days.get(day)}`}
              options={onDay.map((time) => ({
                value: time,
                label: timeLabel.format(new Date(time)),
              }))}
              value={answers.time}
              onPick={onPick}
              error={error}
              errorField="time"
              row
            />
          )}
        </>
      )}
      <Choices
        name="time"
        legend={times.length > 0 ? "Or skip the call" : "Reply by email"}
        options={noCall}
        value={answers.time}
        onPick={onPick}
        error={error}
        errorField="time"
      />
      <FieldError field="time" message={error} />
    </>
  )
}

const panelClass =
  "flex min-w-0 flex-col gap-5 rounded-3xl border border-primary/20 bg-secondary p-[clamp(1.1rem,3vw,1.75rem)]"

const headingClass = "text-2xl text-primary focus:outline-none"

export default function ContactForm({
  email,
  prefill,
}: {
  email?: string
  prefill: Prefill
}) {
  const {
    answers,
    availability,
    steps,
    step,
    stepIndex,
    last,
    errors,
    sent,
    back,
    errorFocus,
    failure,
    next,
    pickDetail,
    pickIntent,
    pickTime,
    sending,
    setToken,
    token,
    trap,
    turnstileKey,
    update,
  } = useContactForm(prefill)
  const heading = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    heading.current?.focus()
  }, [stepIndex, sent])

  useEffect(() => {
    if (errorFocus === 0) return
    const field = FIELD_ORDER.find((f) => errors[f])
    if (field === "time") {
      document
        .querySelector<HTMLInputElement>("#contact-form fieldset input")
        ?.focus()
    } else if (field === "intent" || field === "details") {
      const unanswered = Array.from(
        document.querySelectorAll<HTMLFieldSetElement>(
          "#contact-form fieldset",
        ),
      ).find((set) => !set.querySelector("input:checked"))
      unanswered?.querySelector("input")?.focus()
    } else if (field) {
      document.getElementById(`contact-${field}`)?.focus()
    }
    // Only a fresh validation failure moves focus, not every error edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorFocus])

  if (sent) {
    const firstName = answers.name.trim().split(/\s+/)[0]
    return (
      <div className={panelClass} role="status">
        <h2 ref={heading} tabIndex={-1} className={headingClass}>
          Thanks, {firstName}.
        </h2>
        {hasCallTime(answers) ? (
          <p>
            You asked for a call on{" "}
            {formatCallTime(answers.time, visitorZone())}. That&rsquo;s a
            request for now, and I&rsquo;ll confirm it by email.
          </p>
        ) : (
          <p>I&rsquo;ll reply by email soon.</p>
        )}
        <SiteLink
          href="/"
          className={cn(buttonVariants({ variant: "outline" }), "self-start")}
        >
          Back to the home page
        </SiteLink>
      </div>
    )
  }

  const option = answers.intent ? intentOption(answers.intent) : undefined

  return (
    <form
      id="contact-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        next()
      }}
      className={panelClass}
    >
      <p className="text-sm font-medium" aria-live="polite">
        {stepLabel(stepIndex, steps)}
      </p>
      <h2 ref={heading} tabIndex={-1} className={headingClass}>
        {STEP_HEADINGS[step]}
      </h2>

      {step === "intent" && (
        <>
          <Choices
            name="intent"
            legend="Pick the one that fits best"
            options={INTENTS.map(({ value, label }) => ({ value, label }))}
            value={answers.intent ?? undefined}
            onPick={(value) => isIntent(value) && pickIntent(value)}
            error={errors.intent}
            errorField="intent"
          />
          <FieldError field="intent" message={errors.intent} />
        </>
      )}

      {step === "details" && (
        <>
          {groupsFor(answers.intent).map((group) => (
            <Choices
              key={group.key}
              name={`details-${group.key}`}
              legend={group.question}
              options={group.options.map((o) => ({ value: o, label: o }))}
              value={answers.details[group.key]}
              onPick={(value) => pickDetail(group.key, value)}
              error={errors.details}
              errorField="details"
              row
            />
          ))}
          <FieldError field="details" message={errors.details} />
        </>
      )}

      {step === "message" && option && (
        <TextField
          field="message"
          label={option.prompt}
          multiline
          maxLength={LIMITS.message}
          value={answers.message}
          onChange={update("message")}
          error={errors.message}
        />
      )}

      {step === "call" && (
        <CallStep
          answers={answers}
          availability={availability}
          error={errors.time}
          onPick={pickTime}
        />
      )}

      {step === "reply" && (
        <>
          <TextField
            field="name"
            label={FIELD_LABELS.name}
            autoComplete="name"
            maxLength={LIMITS.name}
            value={answers.name}
            onChange={update("name")}
            error={errors.name}
          />
          <TextField
            field="email"
            label={FIELD_LABELS.email}
            type="email"
            autoComplete="email"
            maxLength={LIMITS.email}
            value={answers.email}
            onChange={update("email")}
            error={errors.email}
          />
          <TextField
            field="company"
            label={FIELD_LABELS.company}
            optional
            autoComplete="organization"
            maxLength={LIMITS.company}
            value={answers.company}
            onChange={update("company")}
            error={errors.company}
          />
          <div
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px overflow-hidden"
          >
            <label htmlFor="contact-website">Leave this empty</label>
            <input
              ref={trap}
              id="contact-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
            />
          </div>
          <Turnstile onToken={setToken} resetKey={turnstileKey} />
          <p className="text-[0.9375rem]">{PRIVACY_NOTE}</p>
        </>
      )}

      {failure && <Failure failure={failure} email={email} />}

      <div className="flex items-center justify-between gap-3 pt-1">
        {stepIndex === 0 ? (
          <SiteLink href="/" className={buttonVariants({ variant: "outline" })}>
            Back
          </SiteLink>
        ) : (
          <Button type="button" variant="outline" onClick={back}>
            Back
          </Button>
        )}
        <Button type="submit" disabled={last && (sending || !token)}>
          {last
            ? sending
              ? "Sending…"
              : hasCallTime(answers)
                ? "Send request"
                : "Send"
            : "Continue"}
        </Button>
      </div>
      {last && (
        <p className="text-sm">
          <SiteLink className="underline" href="/privacy">
            How this site handles your details
          </SiteLink>
        </p>
      )}
    </form>
  )
}
