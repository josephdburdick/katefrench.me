import { createBrowserRouter } from "react-router"

import BookingPage from "./pages/BookingPage"
import CVPage from "./pages/CVPage"
import ContactPage from "./pages/ContactPage"
import Home from "./pages/Home"
import NotFound from "./pages/NotFound"

export const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  { path: "/cv", element: <CVPage /> },
  { path: "/contact", element: <ContactPage /> },
  { path: "/booking/:token", element: <BookingPage /> },
  { path: "*", element: <NotFound /> },
])
