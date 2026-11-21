import { ContentProvider } from "@/components/providers/ContentProvider"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"

import "./index.css"
import { router } from "./router"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ContentProvider>
      <RouterProvider router={router} />
    </ContentProvider>
  </StrictMode>,
)
