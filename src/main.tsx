import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { IntersectionGroundTruthEditorV2WithPreview } from "@/pages/IntersectionGroundTruthEditorV2WithPreview"

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[SignalNow] render error recovered by error boundary", error, info)
  }

  private handleRetry = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex h-svh w-full items-center justify-center bg-background px-6">
          <section className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">SignalNow</p>
            <h1 className="mt-2 text-xl font-black text-foreground">화면을 불러오지 못했습니다.</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">일시적인 화면 오류가 발생했습니다. 다시 시도하면 지도와 신호 안내를 다시 초기화합니다.</p>
            <button type="button" onClick={this.handleRetry} className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition-opacity hover:opacity-90">다시 불러오기</button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}

function Root() {
  const path = window.location.pathname
  return path === "/admin/intersections" || path === "/intersection-editor"
    ? <IntersectionGroundTruthEditorV2WithPreview />
    : <App />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>
)
