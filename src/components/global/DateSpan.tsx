type Props = {
  date: {
    start: string
    end: string | null
  }
}

export default function DateSpan({ date }: Props) {
  const renderDate = (dateProp: string | null) => {
    if (!dateProp) return "Now"

    const date = new Date(dateProp)
    // const month = date.toLocaleString("default", {
    //   month: "short",
    //   timeZone: "UTC",
    // })

    const year = date.toLocaleString("default", {
      year: "numeric",
      timeZone: "UTC",
    })

    return year
  }

  return (
    <div className="text-primary flex items-center justify-start gap-2">
      <time className="whitespace-nowrap">{renderDate(date.start)}</time>
      <span className="border-muted-foreground h-px max-w-6 min-w-4 grow border-t">
        <span className="sr-only">&mdash;</span>
      </span>
      <time className="whitespace-nowrap">{renderDate(date.end)}</time>
    </div>
  )
}
