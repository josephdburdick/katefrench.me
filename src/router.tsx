import { createBrowserRouter } from "react-router"

import BookingPage from "./pages/BookingPage"
import CVPage from "./pages/CVPage"
import ContactPage from "./pages/ContactPage"
import Home from "./pages/Home"
import NotFound from "./pages/NotFound"
import EditHome from "./pages/edit/EditHome"
import EditLead from "./pages/edit/EditLead"
import EditLeads from "./pages/edit/EditLeads"
import EditNumbers from "./pages/edit/EditNumbers"
import EditSection from "./pages/edit/EditSection"

export const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  { path: "/cv", element: <CVPage /> },
  { path: "/contact", element: <ContactPage /> },
  { path: "/booking/:token", element: <BookingPage /> },
  { path: "/edit/:token", element: <EditHome /> },
  { path: "/edit/:token/numbers", element: <EditNumbers /> },
  { path: "/edit/:token/sections/:key", element: <EditSection /> },
  { path: "/edit/:token/leads", element: <EditLeads /> },
  { path: "/edit/:token/leads/:id", element: <EditLead /> },
  { path: "*", element: <NotFound /> },
])
