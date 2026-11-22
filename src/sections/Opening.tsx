import { useApi } from "@/components/providers/ContentProvider"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function Opening() {
  const { data } = useApi()
  const { attributes: intro, html } = data.intro
  const { resume } = data.contact.attributes.links
  return (
    <section className="grid items-center gap-10 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <span className="text-foreground/70 text-xs font-semibold tracking-[0.07em] uppercase">
          {intro.location}
        </span>
        <h2 className="font-display text-primary text-[clamp(2.25rem,4vw+1.5rem,4.25rem)] leading-none font-semibold tracking-[-0.035em] text-balance">
          {intro.heading1}
          <br />
          {intro.heading2}
        </h2>
        <div
          className="max-w-[34rem] text-[clamp(1.0625rem,1vw+0.75rem,1.375rem)] text-pretty"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <a
            className={cn(
              buttonVariants({ size: "lg" }),
              "px-8 text-base",
            )}
            href={intro.link.url}
          >
            {intro.link.text}
          </a>
          <a
            className="text-primary font-medium underline underline-offset-4"
            href={resume.url}
          >
            {resume.text}
          </a>
        </div>
      </div>
      <span className="relative -order-1 justify-self-start md:order-none md:justify-self-center">
        <img
          decoding="async"
          width={intro.picture.width}
          height={intro.picture.height}
          alt={intro.picture.alt}
          src={intro.picture.src}
          className="block h-auto w-32 max-w-full rounded-b-full object-cover object-center md:w-80"
        />
        <span className="bg-primary/10 absolute inset-0 rounded-b-full mix-blend-overlay" />
      </span>
    </section>
  )
}
