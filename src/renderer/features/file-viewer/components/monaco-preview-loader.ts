import { lazy } from "react"

type MonacoCodeViewerComponent = typeof import("./monaco-code-viewer").MonacoCodeViewer
type MonacoPreviewModule = { default: MonacoCodeViewerComponent }

let monacoPreviewModulePromise: Promise<MonacoPreviewModule> | null = null
let idlePreloadHandle: ReturnType<typeof setTimeout> | number | null = null

function loadMonacoPreviewModule(): Promise<MonacoPreviewModule> {
  if (!monacoPreviewModulePromise) {
    monacoPreviewModulePromise = import("./monaco-code-viewer")
      .then((module) => ({ default: module.MonacoCodeViewer }))
      .catch((error) => {
        monacoPreviewModulePromise = null
        throw error
      })
  }

  return monacoPreviewModulePromise
}

export const LazyMonacoCodeViewer = lazy(loadMonacoPreviewModule)

export function preloadMonacoCodeViewer(): Promise<void> {
  return loadMonacoPreviewModule().then(() => undefined)
}

export function scheduleMonacoCodeViewerPreload(): void {
  if (typeof window === "undefined" || idlePreloadHandle !== null || monacoPreviewModulePromise) {
    return
  }

  const preload = () => {
    idlePreloadHandle = null
    void preloadMonacoCodeViewer().catch(() => {
      // A later explicit render can retry through React.lazy.
    })
  }

  const requestIdleCallback = typeof window.requestIdleCallback === "function"
    ? window.requestIdleCallback.bind(window)
    : null

  if (requestIdleCallback) {
    idlePreloadHandle = requestIdleCallback(preload, { timeout: 1500 })
    return
  }

  idlePreloadHandle = setTimeout(preload, 200)
}
