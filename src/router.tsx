import { createBrowserRouter } from "react-router"

import CVPage from "./pages/CVPage"
import Home from "./pages/Home"
import NotFound from "./pages/NotFound"

export const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  { path: "/cv", element: <CVPage /> },
  { path: "*", element: <NotFound /> },
])
