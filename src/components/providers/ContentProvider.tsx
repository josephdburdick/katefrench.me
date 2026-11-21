import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react"

type ContentEntry = {
  attributes: any
  content: string
  html: string
}

export type Content = Record<string, ContentEntry>

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: Content }

const DataContext = createContext<{ data: Content } | undefined>(undefined)

let request: Promise<Content> | undefined

// One request per page load, even when StrictMode runs the effect twice.
function loadContent() {
  request ??= fetch("/api/content").then((res) => {
    if (!res.ok) throw new Error(`GET /api/content: ${res.status}`)
    return res.json() as Promise<Content>
  })
  return request
}

export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" })

  useEffect(() => {
    let active = true
    loadContent().then(
      (data) => active && setState({ status: "ready", data }),
      () => active && setState({ status: "error" }),
    )
    return () => {
      active = false
    }
  }, [])

  if (state.status === "loading") {
    return <p className="container py-8">Loading…</p>
  }

  if (state.status === "error") {
    return (
      <p className="container py-8">
        Couldn&apos;t load this page.{" "}
        <a className="text-primary underline" href={window.location.href}>
          Please refresh.
        </a>
      </p>
    )
  }

  return (
    <DataContext.Provider value={{ data: state.data }}>
      {children}
    </DataContext.Provider>
  )
}

export const useApi = () => {
  const context = useContext(DataContext)
  if (context === undefined) {
    throw new Error("useApi must be used within a ContentProvider")
  }
  return context
}
