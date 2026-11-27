import type { AnchorHTMLAttributes, MouseEvent } from "react"
import { Link, useLocation } from "react-router"

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

function scrollToTarget(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const target = document.getElementById(decodeURIComponent(href.slice(1)))
  if (!target) return
  event.preventDefault()
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView({ behavior: still ? "auto" : "smooth" })
  window.history.replaceState(window.history.state, "", href)
}

/**
 * A link to somewhere on this site. A path (`/contact`) changes page with the
 * view transition in `index.css`, and a fragment (`#new-york`) scrolls
 * smoothly to its target. Any other `href` is a plain link.
 */
export default function SiteLink({ href, onClick, ...rest }: Props) {
  const { pathname } = useLocation()
  if (href.startsWith("#")) {
    return (
      <a
        href={href}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) scrollToTarget(event, href)
        }}
        {...rest}
      />
    )
  }
  if (!href.startsWith("/") || href.startsWith("//")) {
    return <a href={href} onClick={onClick} {...rest} />
  }
  return (
    <Link
      to={href}
      viewTransition
      // Content loads once per page load, so leaving the edit screens reloads to show what Kate just saved.
      reloadDocument={pathname.startsWith("/edit/")}
      onClick={onClick}
      {...rest}
    />
  )
}
