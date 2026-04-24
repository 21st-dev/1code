import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "./button"

interface ErrorBoundaryProps {
  children: ReactNode
  viewerType?: string
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ViewerErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `[ViewerErrorBoundary] ${this.props.viewerType || "viewer"} crashed:`,
      error,
      errorInfo,
    )
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-4 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">
            Failed to render {this.props.viewerType || "file"}
          </p>
          <p className="text-sm text-muted-foreground max-w-[300px]">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <Button variant="outline" size="sm" onClick={this.handleReset}>
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}

interface AppErrorBoundaryState {
  hasError: boolean
  error: Error | null
  ipcBootError: string | null
}

// Key used to remember a recent auto-reload so a crash loop doesn't infinite-reload.
const AUTO_RELOAD_FLAG = "app:error-boundary:auto-reloaded-at"
const AUTO_RELOAD_WINDOW_MS = 10_000

// Root-level error boundary. Catches renderer crashes that would otherwise
// leave the user on a black screen (e.g. from a throwing top-level component
// or a missing IPC bridge during preload boot). Auto-reloads once within a
// short window; subsequent crashes show a manual Reload button instead of
// looping.
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    const ipcBootError =
      typeof window !== "undefined"
        ? ((window as unknown as { __ipcBootError?: string }).__ipcBootError ??
          null)
        : null
    this.state = {
      hasError: Boolean(ipcBootError),
      error: ipcBootError ? new Error(ipcBootError) : null,
      ipcBootError,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AppErrorBoundary] Root crash:", error, errorInfo)
    this.maybeAutoReload()
  }

  componentDidMount() {
    if (this.state.ipcBootError) {
      console.error(
        "[AppErrorBoundary] IPC bridge failed to boot:",
        this.state.ipcBootError,
      )
      this.maybeAutoReload()
    }
  }

  private maybeAutoReload() {
    try {
      const last = Number(sessionStorage.getItem(AUTO_RELOAD_FLAG) || 0)
      if (!last || Date.now() - last > AUTO_RELOAD_WINDOW_MS) {
        sessionStorage.setItem(AUTO_RELOAD_FLAG, String(Date.now()))
        console.warn("[AppErrorBoundary] Auto-reloading once to recover")
        window.location.reload()
      }
    } catch {
      // sessionStorage unavailable (e.g. in a sandbox) — skip auto-reload
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const message =
      this.state.ipcBootError ||
      this.state.error?.message ||
      "An unexpected error occurred."

    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen gap-4 p-6 text-center bg-background text-foreground">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="font-medium text-lg">Something went wrong</p>
        <p className="text-sm text-muted-foreground max-w-[420px] break-words">
          {message}
        </p>
        <Button variant="outline" onClick={this.handleReload}>
          Reload app
        </Button>
      </div>
    )
  }
}
