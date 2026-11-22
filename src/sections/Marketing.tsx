import SubHeading from "@/components/global/SubHeading"
import { useApi } from "@/components/providers/ContentProvider"

type Item = { title: string; text: string }

const pageOffsets = ["", "mt-5", "mt-10"]

export default function Marketing() {
  const { data } = useApi()
  const { heading, items } = data.marketing.attributes
  return (
    <section className="grid items-start gap-x-12 gap-y-10 md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <SubHeading>{heading}</SubHeading>
        <ul>
          {items.map((item: Item, i: number) => (
            <li
              key={i}
              className="border-border border-t py-[0.9rem] text-[0.9375rem] last:border-b"
            >
              <strong className="block font-semibold">{item.title}</strong>
              {item.text}
            </li>
          ))}
        </ul>
      </div>
      <div aria-hidden="true" className="grid grid-cols-3 items-start gap-3">
        {pageOffsets.map((offset, i) => (
          <div
            key={i}
            className={`border-border bg-secondary flex min-w-0 flex-col gap-[0.45rem] rounded-[0.6rem] border p-[0.7rem] ${offset}`}
          >
            <i className="bg-primary block h-13 rounded-[0.35rem] opacity-85" />
            <b className="bg-foreground block h-[0.6rem] w-4/5 rounded-[2px]" />
            <span className="bg-border block h-[0.3rem] rounded-[2px]" />
            <span className="bg-border block h-[0.3rem] w-3/5 rounded-[2px]" />
            <em className="bg-primary mt-[0.2rem] block h-[0.9rem] w-[45%] rounded-[0.25rem]" />
          </div>
        ))}
      </div>
    </section>
  )
}
