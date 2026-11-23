import NextStep from "@/components/global/NextStep"
import SubHeading from "@/components/global/SubHeading"
import { useApi } from "@/components/providers/ContentProvider"
import { cn } from "@/lib/utils"
import { Fragment } from "react"

type Sentence = { text: string; note?: number }
type Note = { lead: string; text: string }

function Marker({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "bg-primary text-primary-foreground inline-grid size-[1.3rem] shrink-0 place-items-center rounded-full font-sans text-[0.6875rem] font-bold",
        className,
      )}
    >
      {n}
    </span>
  )
}

export default function Message() {
  const { data } = useApi()
  const { heading, email, notes } = data.message.attributes
  return (
    <>
      <SubHeading as="h3">{heading}</SubHeading>
      <div className="grid items-start gap-x-12 gap-y-8 md:grid-cols-2">
        <div className="bg-background flex min-w-0 flex-col gap-[0.9rem] rounded-xl p-[clamp(1rem,3vw,1.75rem)] text-[0.9375rem]">
          <p>
            {email.greeting}
            {email.greetingNote != null && (
              <Marker n={email.greetingNote} className="ml-1 align-[0.1em]" />
            )}
          </p>
          {email.paragraphs.map((sentences: Sentence[], i: number) => (
            <p key={i}>
              {sentences.map((s, j) => {
                const cut = s.text.trimEnd().lastIndexOf(" ") + 1
                return (
                  <Fragment key={j}>
                    {j > 0 && " "}
                    {s.text.slice(0, cut)}
                    <span className="whitespace-nowrap">
                      {s.text.slice(cut)}
                      {s.note != null && (
                        <Marker n={s.note} className="ml-1 align-[0.1em]" />
                      )}
                    </span>
                  </Fragment>
                )
              })}
            </p>
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
        <ol className="flex flex-col gap-4">
          {notes.map((note: Note, i: number) => (
            <li
              key={i}
              className="grid grid-cols-[1.3rem_minmax(0,1fr)] gap-3 text-[0.9375rem]"
            >
              <Marker n={i + 1} className="mt-0.5" />
              <div>
                <strong className="block font-semibold">{note.lead}</strong>
                {note.text}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <NextStep source="message" />
    </>
  )
}
