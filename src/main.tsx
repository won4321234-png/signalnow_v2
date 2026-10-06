import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { IntersectionGroundTruthEditorV2WithPreview } from "@/pages/IntersectionGroundTruthEditorV2WithPreview"
import { SignalNavigationPage } from "@/pages/SignalNavigationPage"

function Root() {
  const path = window.location.pathname
  if (path === "/admin/intersections" || path === "/intersection-editor") {
    return <IntersectionGroundTruthEditorV2WithPreview />
  }
  if (path === "/signal-navigation") {
    return <SignalNavigationPage />
  }
  return <App />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  </StrictMode>
)
