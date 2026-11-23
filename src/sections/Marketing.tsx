import SubHeading from "@/components/global/SubHeading"
import { useApi } from "@/components/providers/ContentProvider"
import { cn } from "@/lib/utils"

type Quote = { text: string; name: string; company: string }
type Item = { company: string; title: string; text: string; parts: string[] }

export default function Marketing() {
  const { data } = useApi()
  const { heading, items, quotes } = data.marketing.attributes
  const shown: Quote[] = (quotes ?? []).filter((quote: Quote) =>
    quote.text?.trim(),
  )
  const several = shown.length > 1
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
      {shown.length > 0 && (
        <div
          className={cn(
            "grid gap-x-10 gap-y-8",
            several && "md:grid-cols-2",
            shown.length > 2 && "lg:grid-cols-3",
          )}
        >
          {shown.map((quote, i) => (
            <figure
              key={i}
              className={cn(
                "border-primary flex min-w-0 flex-col gap-3 border-l-4 pl-[clamp(1rem,3vw,1.75rem)]",
                !several && "max-w-[46rem]",
              )}
            >
              <blockquote
                className={cn(
                  "font-display leading-tight tracking-[-0.01em] text-pretty",
                  several
                    ? "text-[clamp(1.125rem,0.8vw+0.9rem,1.375rem)]"
                    : "text-[clamp(1.25rem,1.6vw+0.7rem,1.75rem)]",
                )}
              >
                {quote.text}
              </blockquote>
              <figcaption className="text-foreground/70 mt-auto text-[0.9375rem]">
                {[quote.name, quote.company].filter(Boolean).join(", ")}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  )
}
