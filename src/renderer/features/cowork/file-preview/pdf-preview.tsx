import { useState } from "react"
import { FileWarning, Loader2 } from "lucide-react"
import { cn } from "../../../lib/utils"

interface PdfPreviewProps {
  filePath: string
  className?: string
}

export function PdfPreview({ filePath, className }: PdfPreviewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Use local-file:// protocol for streaming PDF access
  // Format: local-file://localhost/<absolute-path>
  // Ensure path starts with / for proper URL format (Windows paths like D:\... need leading /)
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`
  const fileUrl = `local-file://localhost${normalizedPath}`

  const handleLoad = () => {
    setIsLoading(false)
    setHasError(false)
  }

  const handleError = () => {
    console.error("[PdfPreview] Failed to load:", fileUrl)
    setIsLoading(false)
    setHasError(true)
  }

  if (hasError) {
    return <PdfPreviewFallback className={className} filePath={filePath} />
  }

  return (
    <div className={cn("h-full w-full flex flex-col relative", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <iframe
        src={fileUrl}
        className="flex-1 w-full border-0 bg-white"
        title="PDF Preview"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
}

export function PdfPreviewFallback({ className, filePath }: { className?: string; filePath?: string }) {
  return (
    <div
      className={cn(
        "h-full w-full flex flex-col items-center justify-center text-muted-foreground gap-3",
        className
      )}
    >
      <FileWarning className="h-12 w-12 opacity-40" />
      <p className="text-sm">PDF preview unavailable</p>
      {filePath && (
        <p className="text-xs text-muted-foreground/60 max-w-[300px] truncate">
          {filePath}
        </p>
      )}
    </div>
  )
}
