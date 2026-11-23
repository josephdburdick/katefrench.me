export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <div className="container flex flex-wrap items-center gap-x-4 gap-y-1 pb-8">
      <span>&copy; {year}</span>
      <a className="underline" href="/privacy">
        Privacy
      </a>
    </div>
  )
}
