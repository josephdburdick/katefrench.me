import SubHeading from "@/components/global/SubHeading"
import { useApi } from "@/components/providers/ContentProvider"

export default function AcrossCompany() {
  const { data } = useApi()
  const { attributes, html } = data["across-company"]
  const { processes } = attributes
  const hasCount = processes?.count != null && processes.count !== ""
  return (
    <section className="grid items-start gap-x-12 gap-y-10 md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <SubHeading>{attributes.heading}</SubHeading>
        <div
          className="flex max-w-[36rem] flex-col gap-4 text-[1.0625rem] text-pretty"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      {hasCount && (
        <div className="flex min-w-0 flex-col gap-2">
          <span className="font-display text-primary text-[clamp(2.5rem,5.5vw,4.5rem)] leading-none font-medium tracking-[-0.02em] tabular-nums">
            {processes.count}
          </span>
          {processes.example && (
            <p className="text-[0.9375rem]">{processes.example}</p>
          )}
        </div>
      )}
    </section>
  )
}
