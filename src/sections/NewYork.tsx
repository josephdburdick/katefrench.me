import SubHeading from "@/components/global/SubHeading"
import { useApi } from "@/components/providers/ContentProvider"

import BlockCity from "./BlockCity"
import Message from "./Message"

export default function NewYork() {
  const { data } = useApi()
  const { attributes, html } = data["new-york"]
  return (
    <section
      id="new-york"
      className="bg-secondary flex scroll-mt-4 flex-col gap-12 rounded-3xl p-[clamp(1.25rem,4vw,4rem)]"
    >
      <div className="grid items-start gap-x-12 gap-y-10 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <SubHeading>{attributes.heading}</SubHeading>
          <div
            className="flex max-w-[36rem] flex-col gap-4 text-[1.0625rem] text-pretty"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        <BlockCity
          city={attributes.city}
          items={data.numbers.attributes.items}
        />
      </div>
      <Message />
    </section>
  )
}
