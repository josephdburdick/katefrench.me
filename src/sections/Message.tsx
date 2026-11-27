import NextStep from "@/components/global/NextStep"
import SectionHeading from "@/components/global/SectionHeading"
import { useApi } from "@/components/providers/ContentProvider"
import { cn } from "@/lib/utils"
import { Fragment } from "react"

type Note = { lead: string; text: string }

export default function Message() {
  const { data } = useApi()
  const { heading, subheading, email, notes } = data.message.attributes
  const shown: Note[] = (notes ?? []).filter(
    (note: Note) => note.lead?.trim() || note.text?.trim(),
  )
  return (
    <>
      <SectionHeading as="h3" heading={heading} subheading={subheading} />
      <div
        className={cn(
          "grid items-start gap-x-12 gap-y-8",
          shown.length > 0 && "md:grid-cols-2",
        )}
      >
        <div
          className={cn(
            "bg-background flex min-w-0 flex-col gap-[0.9rem] rounded-xl p-[clamp(1rem,3vw,1.75rem)] text-[0.9375rem]",
            shown.length === 0 && "max-w-[40rem]",
          )}
        >
          <p>{email.greeting}</p>
          {email.paragraphs
            .filter((paragraph: string) => paragraph.trim())
            .map((paragraph: string, i: number) => (
              <p key={i}>{paragraph}</p>
            ))}
          <p>
            {email.signoff.map((line: string, i: number) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </p>
        </div>
        {shown.length > 0 && (
          <ol className="flex flex-col gap-4">
            {shown.map((note, i) => (
              <li
                key={i}
                className="grid grid-cols-[1.3rem_minmax(0,1fr)] gap-3 text-[0.9375rem]"
              >
                <span className="bg-primary text-primary-foreground mt-0.5 inline-grid size-[1.3rem] shrink-0 place-items-center rounded-full font-sans text-[0.6875rem] font-bold">
                  {i + 1}
                </span>
                <div>
                  <strong className="block font-semibold">{note.lead}</strong>
                  {note.text}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <NextStep source="message" />
    </>
  )
}
