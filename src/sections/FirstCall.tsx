import SectionHeading from "@/components/global/SectionHeading"
import { useApi } from "@/components/providers/ContentProvider"

type Step = { title: string; text: string }

export default function FirstCall() {
  const { data } = useApi()
  const { steps, quote } = data["first-call"].attributes
  return (
    <section className="flex flex-col gap-12">
      <div className="flex min-w-0 flex-col gap-6">
        <SectionHeading heading={steps.heading} subheading={steps.subheading} />
        <ol className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {steps.items.map((step: Step, i: number) => (
            <li
              key={i}
              className="border-border flex flex-col gap-1 border-t py-4"
            >
              <span className="font-display text-primary text-[1.375rem] leading-none font-medium tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="mt-1 font-semibold">{step.title}</span>
              <span className="text-foreground/70 text-[0.9375rem]">
                {step.text}
              </span>
            </li>
          ))}
        </ol>
        {quote?.text && (
          <figure className="flex max-w-[40rem] flex-col gap-2">
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
