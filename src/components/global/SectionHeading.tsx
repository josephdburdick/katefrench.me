import SubHeading from "./SubHeading"

/** A section's heading, with `subheading` under it only when it has text. */
export default function SectionHeading({
  heading,
  subheading,
  as,
}: {
  heading: string
  subheading?: string
  as?: "h2" | "h3"
}) {
  const sub = subheading?.trim()
  if (!sub) return <SubHeading as={as}>{heading}</SubHeading>
  return (
    <hgroup className="flex min-w-0 flex-col gap-2">
      <SubHeading as={as}>{heading}</SubHeading>
      <p className="text-foreground/70 max-w-[40rem] text-[1.0625rem] text-pretty">
        {sub}
      </p>
    </hgroup>
  )
}
