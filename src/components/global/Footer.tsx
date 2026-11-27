import SiteLink from "./SiteLink"

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <div className="vt-footer container flex flex-wrap items-center gap-x-4 gap-y-1 pb-8">
      <span>&copy; {year}</span>
      <SiteLink className="underline" href="/privacy">
        Privacy
      </SiteLink>
    </div>
  )
}
