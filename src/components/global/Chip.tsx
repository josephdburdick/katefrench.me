export default function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border bg-background text-foreground/70 self-start rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase">
      {children}
    </span>
  )
}
