import Footer from "@/components/global/Footer"
import Header from "@/components/global/Header"
import { Button } from "@/components/ui/button"
import NotFound from "@/pages/NotFound"
import { type ReactNode, useEffect } from "react"
import { Link } from "react-router"

import type { LoadState } from "./api"

export const linkClass =
  "inline-flex min-h-11 min-w-11 items-center rounded-md font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export const cardLinkClass =
  "border-primary/30 bg-secondary hover:border-primary focus-visible:ring-ring flex min-h-14 items-center justify-between gap-3 rounded-lg border px-4 py-3 font-medium focus-visible:ring-2 focus-visible:outline-none"

function EditMeta() {
  // index.html's "index, follow" would contradict the noindex below.
  useEffect(() => {
    const indexed = document.head.querySelector(
      'meta[name="robots"][content="index, follow"]',
    )
    indexed?.remove()
    return () => {
      if (indexed) document.head.append(indexed)
    }
  }, [])

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <meta name="referrer" content="no-referrer" />
    </>
  )
}

export default function EditShell<T>({
  token,
  title,
  state,
  retry,
  home,
  back,
  children,
}: {
  token: string
  title: string
  state: LoadState<T>
  retry: () => void
  home?: boolean
  /** A second way back, shown after the link to edit home. */
  back?: { to: string; label: string }
  children: (data: T) => ReactNode
}) {
  if (state.status === "not-found") {
    return (
      <>
        <EditMeta />
        <NotFound />
      </>
    )
  }

  return (
    <>
      <EditMeta />
      <Header />
      <main className="container pb-12">
        <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-6">
          {!home && (
            <nav className="flex flex-wrap gap-x-6">
              <Link to={`/edit/${token}`} className={linkClass}>
                Back to edit home
              </Link>
              {back && (
                <Link to={back.to} className={linkClass}>
                  {back.label}
                </Link>
              )}
            </nav>
          )}
          <h2 className="font-display text-primary text-2xl break-words md:text-3xl">
            {title}
          </h2>
          {state.status === "loading" && <p>Loading…</p>}
          {state.status === "error" && (
            <div role="alert" className="flex flex-col items-start gap-3">
              <p>
                This didn&rsquo;t load. Check your connection and try again.
              </p>
              <Button type="button" className="min-h-11" onClick={retry}>
                Try again
              </Button>
            </div>
          )}
          {state.status === "ready" && children(state.data)}
        </div>
      </main>
      <Footer />
    </>
  )
}
