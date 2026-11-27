import { useLayoutEffect, useRef } from "react"
import {
  Outlet,
  ScrollRestoration,
  createBrowserRouter,
  useLocation,
} from "react-router"

import BookingPage from "./pages/BookingPage"
import CVPage from "./pages/CVPage"
import ContactPage from "./pages/ContactPage"
import Home from "./pages/Home"
import NotFound from "./pages/NotFound"
import PrivacyPage from "./pages/PrivacyPage"
import SuggestionPage from "./pages/SuggestionPage"
import EditHome from "./pages/edit/EditHome"
import EditLead from "./pages/edit/EditLead"
import EditLeads from "./pages/edit/EditLeads"
import EditNumbers from "./pages/edit/EditNumbers"
import EditResume from "./pages/edit/EditResume"
import EditSection from "./pages/edit/EditSection"

const depth = (path: string) => path.split("/").filter(Boolean).length

function Root() {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  // Runs inside the view transition's update, so the transition CSS sees the direction before it animates.
  useLayoutEffect(() => {
    const change = depth(pathname) - depth(previous.current)
    previous.current = pathname
    document.documentElement.dataset.nav =
      change > 0 ? "forward" : change < 0 ? "back" : "across"
  }, [pathname])
  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/cv", element: <CVPage /> },
      { path: "/contact", element: <ContactPage /> },
      { path: "/privacy", element: <PrivacyPage /> },
      { path: "/booking/time/:token", element: <SuggestionPage /> },
      { path: "/booking/:token", element: <BookingPage /> },
      { path: "/edit/:token", element: <EditHome /> },
      { path: "/edit/:token/numbers", element: <EditNumbers /> },
      { path: "/edit/:token/resume", element: <EditResume /> },
      { path: "/edit/:token/sections/:key", element: <EditSection /> },
      { path: "/edit/:token/leads", element: <EditLeads /> },
      { path: "/edit/:token/leads/:id", element: <EditLead /> },
      { path: "*", element: <NotFound /> },
    ],
  },
])
