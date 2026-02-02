/**
 * Submodule Warning Component
 *
 * Displays a warning dialog when the ii-spec submodule is not properly initialized.
 * Provides instructions for users to initialize the submodule.
 *
 * @see specs/001-speckit-ui-integration/tasks.md T124
 */

import { AlertTriangle, Terminal, Copy, Check } from "lucide-react"
import { useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface SubmoduleWarningProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  message?: string
  onDismiss?: () => void
}

const INIT_COMMAND = "git submodule update --init --recursive"

export function SubmoduleWarning({
  open,
  onOpenChange,
  message,
  onDismiss,
}: SubmoduleWarningProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INIT_COMMAND)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy command:", error)
    }
  }, [])

  const handleDismiss = useCallback(() => {
    onDismiss?.()
    onOpenChange(false)
  }, [onDismiss, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            SpecKit Submodule Not Initialized
          </DialogTitle>
          <DialogDescription>
            The ii-spec submodule is required for SpecKit features to work
            properly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {message && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">
              Run the following command in your project directory:
            </p>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-muted rounded-md px-3 py-2 font-mono text-sm">
                <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                <code className="flex-1">{INIT_COMMAND}</code>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyCommand}
                aria-label="Copy command"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p>After running the command:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Restart the application</li>
              <li>Open the SpecKit panel again</li>
            </ol>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleDismiss}>
            Dismiss
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SubmoduleWarning
