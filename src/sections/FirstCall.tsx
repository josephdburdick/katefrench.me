import SubHeading from "@/components/global/SubHeading"
import { useApi } from "@/components/providers/ContentProvider"

type Step = { title: string; text: string }

export default function FirstCall() {
  const { data } = useApi()
  const { heading, lines, steps, quote } = data["first-call"].attributes
  return (
    <section className="grid items-start gap-x-12 gap-y-10 md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <SubHeading>{heading}</SubHeading>
        <ul>
          {lines.map((line: string, i: number) => (
            <li
              key={i}
              className="border-border font-display border-t py-4 text-[clamp(1.25rem,1.6vw+0.7rem,1.75rem)] leading-tight tracking-[-0.01em] last:border-b"
            >
              {line}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <SubHeading as="h3">{steps.heading}</SubHeading>
        <ol>
          {steps.items.map((step: Step, i: number) => (
            <li
              key={i}
              className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-3 pb-[0.9rem] text-[0.9375rem]"
            >
              <span
                aria-hidden="true"
                className="bg-primary mt-2 size-[0.55rem] justify-self-center rounded-full"
              />
              {i < steps.items.length - 1 && (
                <span
                  aria-hidden="true"
                  className="bg-border absolute top-5 -bottom-[0.35rem] left-[0.44rem] w-0.5"
                />
              )}
              <div>
                {step.title}
                <small className="text-foreground/70 block text-[0.8125rem]">
                  {step.text}
                </small>
              </div>
            </li>
          ))}
        </ol>
        {quote?.text && (
          <figure className="flex flex-col gap-2">
            <blockquote className="font-display text-[clamp(1.25rem,1.6vw+0.7rem,1.75rem)] leading-tight">
              {quote.text}
            </blockquote>
            <figcaption className="text-foreground/70 text-[0.9375rem]">
              {[quote.name, quote.venue].filter(Boolean).join(", ")}
            </figcaption>
          </figure>
        )}
      </div>
    </section>
  )
}
