import { Component, type ReactNode } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "./button"

interface RenderErrorBoundaryProps {
  children: ReactNode
  title?: string
  description?: string
  resetKey?: string | number | null
  onReset?: () => void
  compact?: boolean
  showReload?: boolean
}

interface ErrorBoundaryProps {
  children: ReactNode
  viewerType?: string
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class RenderErrorBoundary extends Component<
  RenderErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: RenderErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `[RenderErrorBoundary] ${this.props.title || "section"} crashed:`,
      error,
      errorInfo,
    )
  }

  componentDidUpdate(prevProps: RenderErrorBoundaryProps) {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false, error: null })
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={
            this.props.compact
              ? "flex h-full flex-col items-center justify-center gap-3 p-4 text-center"
              : "flex h-full min-h-0 w-full flex-col items-center justify-center gap-4 p-6 text-center"
          }
        >
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {this.props.title || "Something went wrong"}
            </p>
            <p className="text-sm text-muted-foreground max-w-[420px]">
              {this.props.description ||
                this.state.error?.message ||
                "An unexpected error occurred."}
            </p>
            {this.props.description && this.state.error?.message && (
              <p className="text-xs text-muted-foreground/70 max-w-[420px] break-words">
                {this.state.error.message}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={this.handleReset}>
              Try again
            </Button>
            {this.props.showReload !== false && (
              <Button variant="outline" size="sm" onClick={this.handleReload}>
                Reload window
              </Button>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export function ViewerErrorBoundary({
  children,
  viewerType,
  onReset,
}: ErrorBoundaryProps) {
  return (
    <RenderErrorBoundary
      title={`Failed to render ${viewerType || "file"}`}
      onReset={onReset}
      compact
      showReload={false}
    >
      {children}
    </RenderErrorBoundary>
  )
}
