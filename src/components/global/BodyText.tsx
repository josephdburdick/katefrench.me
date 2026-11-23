type BodyTextProps = React.HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode
}

export default function BodyText({ children, ...props }: BodyTextProps) {
  return (
    <span
      className="prose lg:prose-lg xl:prose-xl space-y-4 [&_a]:text-red-400 [&>*+*]:mt-4"
      {...props}
    >
      {children}
    </span>
  )
}
