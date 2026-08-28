import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { IntersectionGroundTruthEditorV2WithPreview } from "@/pages/IntersectionGroundTruthEditorV2WithPreview"

function Root() {
  const path = window.location.pathname
  return path === "/admin/intersections" || path === "/intersection-editor"
    ? <IntersectionGroundTruthEditorV2WithPreview />
    : <App />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  </StrictMode>
)
