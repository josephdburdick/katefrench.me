import SiteLink from "@/components/global/SiteLink"
import { useApi } from "@/components/providers/ContentProvider"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"

export default function Closing() {
  const { data } = useApi()
  const { heading, text, contact, picture } = data.closing.attributes
  const { linkedin, resume } = data.contact.attributes.links
  const block = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = block.current
    if (!el) return
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        seen.disconnect()
        setShown(true)
      },
      { threshold: 0.35 },
    )
    seen.observe(el)
    return () => seen.disconnect()
  }, [])

  return (
    <section
      ref={block}
      className={cn(
        "bg-primary text-primary-foreground relative rounded-3xl p-[clamp(1.5rem,5vw,4.5rem)]",
        picture && "max-md:pb-0 md:mt-24",
      )}
    >
      <div className={cn("flex flex-col gap-6", picture && "md:max-w-[58%]")}>
        <h2 className="font-display max-w-[16ch] text-[clamp(2.25rem,4vw+1.5rem,4.25rem)] leading-none font-semibold tracking-[-0.035em] text-balance">
          {heading}
        </h2>
        <p className="max-w-[34rem] text-lg">{text}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <SiteLink
            className="bg-primary-foreground text-foreground hover:bg-foreground hover:text-primary-foreground active:bg-foreground/85 focus-visible:outline-foreground rounded-lg px-6 py-[0.7rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            href={contact.url}
          >
            {contact.text}
          </SiteLink>
          <a
            className="font-medium underline underline-offset-4"
            href={linkedin.url}
          >
            {linkedin.text}
          </a>
          <SiteLink
            className="font-medium underline underline-offset-4"
            href={resume.url}
          >
            {resume.text}
          </SiteLink>
        </div>
      </div>
      {picture && (
        <div className="max-md:mt-8 max-md:flex max-md:h-64 max-md:justify-center max-md:overflow-hidden md:absolute md:right-[5%] md:bottom-0 md:h-[128%] md:[clip-path:inset(-60%_-40%_0_-40%)]">
          <img
            decoding="async"
            loading="lazy"
            width={picture.width}
            height={picture.height}
            alt={picture.alt}
            src={picture.src}
            className={cn(
              "block w-auto max-w-none max-md:h-[37.5rem] md:h-full",
              shown
                ? "motion-safe:animate-[closing-rise_900ms_cubic-bezier(0.2,0.9,0.25,1.12)_both]"
                : "motion-safe:translate-y-[105%]",
            )}
          />
        </div>
      )}
    </section>
  )
}
