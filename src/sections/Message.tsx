import NextStep from "@/components/global/NextStep"
import SubHeading from "@/components/global/SubHeading"
import { useApi } from "@/components/providers/ContentProvider"
import { cn } from "@/lib/utils"
import { Fragment } from "react"

type Phrase = { text: string; note: number }
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
  const { heading, intro, pitch, notes } = data.message.attributes
  return (
    <>
      <div className="grid items-start gap-x-12 gap-y-8 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <SubHeading as="h3">{heading}</SubHeading>
          <p className="text-[1.0625rem]">{intro}</p>
          <blockquote className="bg-background font-display rounded-xl p-[clamp(1.25rem,3vw,2rem)] text-[clamp(1.5rem,2.2vw+0.8rem,2.25rem)] leading-[1.15] tracking-[-0.01em] text-balance">
            {pitch.map((phrase: Phrase, i: number) => {
              const cut = phrase.text.trimEnd().lastIndexOf(" ") + 1
              return (
                <Fragment key={i}>
                  {i > 0 && " "}
                  {phrase.text.slice(0, cut)}
                  <span className="whitespace-nowrap">
                    {phrase.text.slice(cut)}
                    <Marker n={phrase.note} className="ml-1.5 align-[0.3em]" />
                  </span>
                </Fragment>
              )
            })}
          </blockquote>
        </div>
        <ol className="flex flex-col gap-5 md:self-end">
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
