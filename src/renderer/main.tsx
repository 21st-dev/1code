// Only initialize Sentry in production to avoid IPC errors in dev mode
if (import.meta.env.PROD) {
  import("@sentry/electron/renderer").then((Sentry) => {
    Sentry.init()
  })
}

import ReactDOM from "react-dom/client"
import { App } from "./App"
import "./styles/globals.css"
import { preloadDiffHighlighter } from "./lib/themes/diff-view-highlighter"
import { initWebVitals } from "./lib/monitoring/web-vitals"

// Preload shiki highlighter for diff view (prevents delay when opening diff sidebar)
preloadDiffHighlighter()

// Initialize web vitals monitoring for CLS tracking
initWebVitals()

// Suppress ResizeObserver loop error - this is a non-fatal browser warning
// that can occur when layout changes trigger observation callbacks
// Common with virtualization libraries and diff viewers
const resizeObserverErr = /ResizeObserver loop/

// Handle both error event and unhandledrejection
window.addEventListener("error", (e) => {
  if (e.message && resizeObserverErr.test(e.message)) {
    e.stopImmediatePropagation()
    e.preventDefault()
    return false
  }
})

// Also override window.onerror for broader coverage
const originalOnError = window.onerror
window.onerror = (message, source, lineno, colno, error) => {
  if (typeof message === "string" && resizeObserverErr.test(message)) {
    return true // Suppress the error
  }
  if (originalOnError) {
    return originalOnError(message, source, lineno, colno, error)
  }
  return false
}

const rootElement = document.getElementById("root")

if (!rootElement) {
  console.error("[Renderer] Root element not found")
  document.body.innerHTML = "<pre style='padding:16px;color:#b91c1c'>Root element not found</pre>"
} else {
  try {
    ReactDOM.createRoot(rootElement).render(<App />)
    console.log("[Renderer] App rendered")
    setTimeout(() => {
      const root = document.getElementById("root")
      if (!root) {
        console.warn("[Renderer] Root missing after render")
        return
      }
      console.log("[Renderer] Root children:", root.children.length)
      console.log("[Renderer] Root HTML length:", root.innerHTML.length)
      const rootStyle = window.getComputedStyle(root)
      console.log("[Renderer] Root styles:", {
        display: rootStyle.display,
        visibility: rootStyle.visibility,
        opacity: rootStyle.opacity,
      })
      const bodyStyle = window.getComputedStyle(document.body)
      console.log("[Renderer] Body styles:", {
        background: bodyStyle.backgroundColor,
        color: bodyStyle.color,
      })
    }, 1000)
  } catch (err) {
    console.error("[Renderer] App render failed:", err)
    const message = err instanceof Error ? err.message : String(err)
    rootElement.innerHTML = `<pre style='padding:16px;color:#b91c1c'>Render error: ${message}</pre>`
  }
}
