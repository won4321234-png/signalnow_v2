import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { IntersectionEditorPage } from "@/pages/IntersectionEditorPage"

function Root() {
  return window.location.pathname === "/admin/intersections" || window.location.pathname === "/intersection-editor"
    ? <IntersectionEditorPage />
    : <App />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  </StrictMode>
)
