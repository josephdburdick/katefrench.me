import { useApi } from "@/components/providers/ContentProvider"

export default function Closing() {
  const { data } = useApi()
  const { heading, text, contact } = data.closing.attributes
  const { linkedin, resume } = data.contact.attributes.links
  return (
    <section className="bg-primary text-primary-foreground flex flex-col gap-6 rounded-3xl p-[clamp(1.5rem,5vw,4.5rem)]">
      <h2 className="font-display max-w-[16ch] text-[clamp(2.25rem,4vw+1.5rem,4.25rem)] leading-none font-semibold tracking-[-0.035em] text-balance">
        {heading}
      </h2>
      <p className="max-w-[34rem] text-lg">{text}</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <a
          className="bg-primary-foreground text-foreground focus-visible:outline-primary-foreground rounded-lg px-6 py-[0.7rem] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          href={contact.url}
        >
          {contact.text}
        </a>
        <a
          className="font-medium underline underline-offset-4"
          href={linkedin.url}
        >
          {linkedin.text}
        </a>
        <a
          className="font-medium underline underline-offset-4"
          href={resume.url}
        >
          {resume.text}
        </a>
      </div>
    </section>
  )
}
