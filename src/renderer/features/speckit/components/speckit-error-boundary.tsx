/**
 * SpecKitErrorBoundary Component
 *
 * Error boundary that catches rendering errors in SpecKit components
 * and displays a user-friendly fallback UI.
 *
 * @see specs/001-speckit-ui-integration/tasks.md (T140)
 */

import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  /** Child components to render */
  children: ReactNode
  /** Fallback title for error state */
  fallbackTitle?: string
  /** Callback when reset is triggered */
  onReset?: () => void
}

interface State {
  /** Whether an error has been caught */
  hasError: boolean
  /** The error that was caught */
  error: Error | null
  /** Error info with component stack */
  errorInfo: { componentStack: string } | null
}

/**
 * Error boundary for SpecKit components
 *
 * Catches rendering errors and displays a fallback UI with:
 * - User-friendly error message
 * - Error details (in development)
 * - Reset button to retry rendering
 */
export class SpecKitErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    // Log error to console in development
    console.error("[SpecKit Error]", error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      const { fallbackTitle = "SpecKit Error" } = this.props
      const isDev = process.env.NODE_ENV === "development"

      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
          <h3 className="text-lg font-semibold mb-2">{fallbackTitle}</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Something went wrong while rendering SpecKit. This may be due to a
            temporary issue or missing data.
          </p>

          {/* Show error details in development */}
          {isDev && this.state.error && (
            <details className="mb-4 text-left w-full max-w-md">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Error Details (Development)
              </summary>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                {this.state.error.message}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}

          <Button onClick={this.handleReset} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}

export default SpecKitErrorBoundary
