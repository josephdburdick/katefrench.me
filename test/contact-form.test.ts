import { describe, expect, it } from "vitest"

import {
  type Answers,
  INTENTS,
  LIMITS,
  PRIVACY_NOTE,
  SOURCES,
  SOURCE_INTENT,
  buildEmail,
  emptyAnswers,
  firstStepWithError,
  isSource,
  nextStepHref,
  prefillFrom,
  stepLabel,
  stepsFor,
  toAnswers,
  validateAll,
  validateStep,
  withIntent,
} from "../src/lib/contact-form"

const hiring = (overrides: Partial<Answers> = {}): Answers => ({
  intent: "hiring",
  details: { role: "Sales", location: "New York", start: "Right away" },
  message: "We need someone to open New York.",
  name: "Sam Lee",
  email: "sam@example.com",
  company: "Acme",
  ...overrides,
})

describe("intents", () => {
  it("uses the issue's option labels", () => {
    expect(INTENTS.map((intent) => intent.label)).toEqual([
      "I'm hiring for a role",
      "I run a venue or put on events",
      "I'd like to work together on content",
      "Something else",
    ])
  })
})

describe("stepsFor", () => {
  it("skips the details step for other", () => {
    const steps = stepsFor("other")
    expect(steps).toHaveLength(3)
    expect(steps).not.toContain("details")
    expect(steps).toEqual(["intent", "message", "reply"])
  })

  it("has four steps for every intent with details", () => {
    for (const intent of ["hiring", "venue", "content"] as const) {
      expect(stepsFor(intent)).toEqual([
        "intent",
        "details",
        "message",
        "reply",
      ])
    }
  })

  it("shows four steps before an intent is picked", () => {
    expect(stepsFor(null)).toHaveLength(4)
  })
})

describe("stepLabel", () => {
  it("counts only the steps the visitor will see", () => {
    expect(stepLabel(1, stepsFor("other"))).toBe("Step 2 of 3")
    expect(stepLabel(1, stepsFor("hiring"))).toBe("Step 2 of 4")
    expect(stepLabel(0, stepsFor("venue"))).toBe("Step 1 of 4")
  })
})

describe("withIntent", () => {
  it("clears details when the intent changes", () => {
    const next = withIntent(hiring(), "venue")
    expect(next.intent).toBe("venue")
    expect(next.details).toEqual({})
    expect(next.message).toBe(hiring().message)
  })

  it("keeps details when the intent stays the same", () => {
    const answers = hiring()
    expect(withIntent(answers, "hiring")).toBe(answers)
  })
})

describe("validateStep", () => {
  it("requires an intent", () => {
    expect(validateStep("intent", emptyAnswers()).intent).toBeTruthy()
    expect(validateStep("intent", hiring())).toEqual({})
  })

  it("requires an answer from each detail group's own list", () => {
    expect(validateStep("details", hiring())).toEqual({})
    expect(
      validateStep("details", hiring({ details: { role: "Sales" } })).details,
    ).toBeTruthy()
    expect(
      validateStep(
        "details",
        hiring({
          details: { role: "Chef", location: "New York", start: "Right away" },
        }),
      ).details,
    ).toBeTruthy()
    expect(
      validateStep(
        "details",
        hiring({
          details: { role: "Remote", location: "Sales", start: "Right away" },
        }),
      ).details,
    ).toBeTruthy()
  })

  it("needs no details for other", () => {
    expect(
      validateStep("details", { ...emptyAnswers(), intent: "other" }),
    ).toEqual({})
  })
})

describe("validateAll", () => {
  it("accepts a complete submission", () => {
    expect(validateAll(hiring())).toEqual({})
    expect(
      validateAll(hiring({ intent: "other", details: {}, company: "" })),
    ).toEqual({})
  })

  it("rejects a missing or unknown intent", () => {
    expect(validateAll(emptyAnswers()).intent).toBeTruthy()
  })

  it("checks the message at its limit and one past it", () => {
    expect(
      validateAll(hiring({ message: "a".repeat(LIMITS.message) })),
    ).toEqual({})
    expect(
      validateAll(hiring({ message: "a".repeat(LIMITS.message + 1) })).message,
    ).toBeTruthy()
    expect(validateAll(hiring({ message: "   " })).message).toBe(
      "Write a sentence or two so I know what this is about.",
    )
  })

  it("checks the name at its limit and one past it", () => {
    expect(validateAll(hiring({ name: "a".repeat(LIMITS.name) }))).toEqual({})
    expect(
      validateAll(hiring({ name: "a".repeat(LIMITS.name + 1) })).name,
    ).toBeTruthy()
    expect(validateAll(hiring({ name: " " })).name).toBeTruthy()
  })

  it("checks the email shape, at its limit and one past it", () => {
    const at = (length: number) =>
      `${"a".repeat(length - "@example.com".length)}@example.com`
    expect(validateAll(hiring({ email: at(LIMITS.email) }))).toEqual({})
    expect(
      validateAll(hiring({ email: at(LIMITS.email + 1) })).email,
    ).toBeTruthy()
    for (const email of [
      "",
      "sam",
      "sam@example",
      "sam @example.com",
      "@x.co",
    ]) {
      expect(validateAll(hiring({ email })).email).toBeTruthy()
    }
  })

  it("checks the company at its limit and one past it", () => {
    expect(
      validateAll(hiring({ company: "a".repeat(LIMITS.company) })),
    ).toEqual({})
    expect(
      validateAll(hiring({ company: "a".repeat(LIMITS.company + 1) })).company,
    ).toBeTruthy()
  })

  it("rejects options outside the lists and unknown detail keys", () => {
    expect(
      validateAll(
        hiring({
          details: {
            role: "Sales",
            location: "Mars",
            start: "Right away",
          },
        }),
      ).details,
    ).toBeTruthy()
    expect(
      validateAll(
        hiring({
          details: { ...hiring().details, budget: "Lots" },
        }),
      ).details,
    ).toBeTruthy()
    expect(
      validateAll(hiring({ intent: "other", details: { role: "Sales" } }))
        .details,
    ).toBeTruthy()
  })

  it("points at the first step with an error", () => {
    const steps = stepsFor("hiring")
    expect(firstStepWithError(steps, { email: "x", message: "y" })).toBe(2)
    expect(firstStepWithError(steps, {})).toBe(-1)
  })
})

describe("toAnswers", () => {
  it("turns junk into empty answers", () => {
    for (const junk of [null, undefined, 1, "x", [], true]) {
      expect(toAnswers(junk)).toEqual(emptyAnswers())
    }
  })

  it("empties non-strings and drops unknown keys", () => {
    const answers = toAnswers({
      intent: "boss",
      details: { role: 1, location: "Remote" },
      message: ["hi"],
      name: { first: "Sam" },
      email: "sam@example.com",
      company: null,
      to: "evil@example.com",
    })
    expect(answers).toEqual({
      intent: null,
      details: { role: "", location: "Remote" },
      message: "",
      name: "",
      email: "sam@example.com",
      company: "",
    })
    expect(toAnswers({ details: ["Sales"] }).details).toEqual({})
  })
})

describe("buildEmail", () => {
  it("puts each intent's identifying answers in the subject", () => {
    expect(buildEmail(hiring()).subject).toBe(
      "[katefrench.me] Hiring · Sales · New York",
    )
    expect(
      buildEmail(
        hiring({
          intent: "venue",
          details: { kind: "A festival", next: "This month" },
        }),
      ).subject,
    ).toBe("[katefrench.me] Venue or events · A festival")
    expect(
      buildEmail(
        hiring({
          intent: "content",
          details: { idea: "A neighborhood guide" },
        }),
      ).subject,
    ).toBe("[katefrench.me] Content · A neighborhood guide")
    expect(buildEmail(hiring({ intent: "other", details: {} })).subject).toBe(
      "[katefrench.me] Something else",
    )
  })

  it("lists every answer with its question", () => {
    const { text } = buildEmail(hiring())
    for (const line of [
      "What brings you here?\nI'm hiring for a role",
      "What kind of role?\nSales",
      "Where is it based?\nNew York",
      "When does it start?\nRight away",
      "What is the role, and what would I own in it?\nWe need someone to open New York.",
      "Your name\nSam Lee",
      "Email\nsam@example.com",
      "Company or venue\nAcme",
    ]) {
      expect(text).toContain(line)
    }
  })

  it("replies to the visitor, with CR and LF removed from the name", () => {
    expect(
      buildEmail(hiring({ name: "Sam\r\nBcc: x@evil.example" })).replyTo,
    ).toEqual({ email: "sam@example.com", name: "Sam Bcc: x@evil.example" })
  })

  it("has no HTML body", () => {
    expect(Object.keys(buildEmail(hiring())).sort()).toEqual([
      "replyTo",
      "subject",
      "text",
    ])
  })
})

describe("isSource", () => {
  it("accepts each source", () => {
    for (const source of SOURCES) expect(isSource(source)).toBe(true)
  })

  it("rejects anything else", () => {
    for (const value of [undefined, null, 1, {}, ["numbers"], "evil", ""]) {
      expect(isSource(value)).toBe(false)
    }
  })
})

describe("prefillFrom", () => {
  const prefill = (query: string) => prefillFrom(new URLSearchParams(query))

  it("reads a known intent and source", () => {
    expect(prefill("intent=venue&from=numbers")).toEqual({
      intent: "venue",
      from: "numbers",
    })
  })

  it("drops an unknown intent", () => {
    expect(prefill("intent=bogus&from=numbers")).toEqual({
      intent: null,
      from: "numbers",
    })
  })

  it("drops an unknown source", () => {
    expect(prefill("intent=hiring&from=evil")).toEqual({
      intent: "hiring",
      from: null,
    })
  })

  it("gives nulls when both are missing", () => {
    expect(prefill("")).toEqual({ intent: null, from: null })
  })

  it("treats mixed case or extra whitespace as unknown", () => {
    for (const query of [
      "intent=Hiring&from=Numbers",
      "intent=%20hiring&from=numbers%20",
      "intent=HIRING&from=NEW-YORK",
    ]) {
      expect(prefill(query), query).toEqual({ intent: null, from: null })
    }
  })
})

describe("calls to action", () => {
  it("maps each section to its intent", () => {
    expect(SOURCE_INTENT).toEqual({
      numbers: "hiring",
      "new-york": "hiring",
      message: "venue",
      venues: "venue",
    })
  })

  it("links each section to a prefilled /contact", () => {
    expect(SOURCES.map(nextStepHref)).toEqual([
      "/contact?intent=hiring&from=numbers",
      "/contact?intent=hiring&from=new-york",
      "/contact?intent=venue&from=message",
      "/contact?intent=venue&from=venues",
    ])
  })

  it("opens a known intent on the step after it", () => {
    expect(stepsFor("hiring")[1]).toBe("details")
    expect(stepsFor("venue")[1]).toBe("details")
  })

  it("has the privacy sentence", () => {
    expect(PRIVACY_NOTE).toBe(
      "I keep your message so I can reply to you, and I don't do anything else with it.",
    )
  })
})
