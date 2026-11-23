import SubHeading from "@/components/global/SubHeading"
import { useApi } from "@/components/providers/ContentProvider"

type Item = { company: string; title: string; text: string; parts: string[] }

export default function Marketing() {
  const { data } = useApi()
  const { heading, items, quote } = data.marketing.attributes
  return (
    <section className="flex flex-col gap-8">
      <SubHeading>{heading}</SubHeading>
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((item: Item, i: number) => (
          <li
            key={i}
            className="bg-secondary flex min-w-0 flex-col gap-3 rounded-2xl p-[clamp(1.25rem,3vw,2rem)]"
          >
            <span className="text-foreground/70 text-[0.8125rem] font-medium">
              {item.company}
            </span>
            <h3 className="font-display text-primary text-[1.625rem] leading-[1.1] font-medium tracking-[-0.02em] text-balance">
              {item.title}
            </h3>
            <p className="text-[0.9375rem]">{item.text}</p>
            <ul className="mt-auto flex flex-wrap gap-2 pt-2">
              {item.parts.map((part, j) => (
                <li
                  key={j}
                  className="bg-background rounded-full px-3 py-1 text-[0.8125rem] font-medium"
                >
                  {part}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {quote?.text && (
        <figure className="border-primary flex max-w-[46rem] flex-col gap-3 border-l-4 pl-[clamp(1rem,3vw,1.75rem)]">
          <blockquote className="font-display text-[clamp(1.25rem,1.6vw+0.7rem,1.75rem)] leading-tight tracking-[-0.01em] text-pretty">
            {quote.text}
          </blockquote>
          <figcaption className="text-foreground/70 text-[0.9375rem]">
            {[quote.name, quote.company].filter(Boolean).join(", ")}
          </figcaption>
        </figure>
      )}
    </section>
  )
}
