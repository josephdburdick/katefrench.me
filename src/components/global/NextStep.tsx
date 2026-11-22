import { useApi } from "@/components/providers/ContentProvider"
import { buttonVariants } from "@/components/ui/button"
import { type Source, nextStepHref } from "@/lib/contact-form"
import { cn } from "@/lib/utils"

export default function NextStep({ source }: { source: Source }) {
  const { data } = useApi()
  const text = data[source]?.attributes?.cta?.text
  if (typeof text !== "string" || !text.trim()) return null
  return (
    <a
      href={nextStepHref(source)}
      className={cn(
        buttonVariants({ size: "lg" }),
        "focus-visible:ring-foreground focus-visible:ring-offset-background max-w-full self-start text-left text-[0.9375rem] whitespace-normal focus-visible:ring-2 focus-visible:ring-offset-2",
      )}
    >
      {text}
    </a>
  )
}
