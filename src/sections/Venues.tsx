import NextStep from "@/components/global/NextStep"
import SectionHeading from "@/components/global/SectionHeading"
import { useApi } from "@/components/providers/ContentProvider"
import { cn } from "@/lib/utils"

type Role = {
  when: string
  title: string
  paragraph: string
  takeaway: string
  photo: { src: string; alt: string; width: number; height: number }
  caption: string
}

export default function Venues() {
  const { data } = useApi()
  const { heading, subheading, roles } = data.venues.attributes
  return (
    <section className="flex flex-col gap-8">
      <SectionHeading heading={heading} subheading={subheading} />
      <ul className="flex flex-col gap-12">
        {roles.map((role: Role, i: number) => (
          <li
            key={role.title}
            className="grid items-start gap-x-10 gap-y-6 md:grid-cols-2"
          >
            <figure
              className={cn(
                "flex flex-col gap-2",
                i % 2 === 1 && "md:order-last",
              )}
            >
              <div className="relative overflow-hidden rounded-xl">
                <img
                  loading="lazy"
                  decoding="async"
                  src={role.photo.src}
                  alt={role.photo.alt}
                  width={role.photo.width}
                  height={role.photo.height}
                  className="block aspect-[3/2] h-auto w-full object-cover"
                />
                <span className="bg-primary/50 absolute inset-0 mix-blend-soft-light" />
              </div>
              <figcaption className="text-foreground/70 text-[0.8125rem]">
                {role.caption}
              </figcaption>
            </figure>
            <div className="flex min-w-0 flex-col gap-4">
              <span className="text-foreground/70 text-[0.8125rem]">
                {role.when}
              </span>
              <h3 className="font-display text-primary text-[1.625rem] leading-[1.1] font-medium tracking-[-0.02em]">
                {role.title}
              </h3>
              <p>{role.paragraph}</p>
              <p className="font-semibold">{role.takeaway}</p>
            </div>
          </li>
        ))}
      </ul>
      <NextStep source="venues" />
    </section>
  )
}
