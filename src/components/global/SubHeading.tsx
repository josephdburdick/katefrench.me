import { cn } from "@/lib/utils"

type Props = React.HTMLAttributes<HTMLHeadingElement> & {
  as?: "h2" | "h3"
}

export default function SubHeading({
  as: Tag = "h2",
  className,
  ...props
}: Props) {
  return (
    <Tag
      className={cn(
        "font-display text-primary text-[clamp(1.625rem,1.2vw+1.25rem,2.125rem)] leading-[1.1] font-medium tracking-[-0.02em] text-balance",
        className,
      )}
      {...props}
    />
  )
}
