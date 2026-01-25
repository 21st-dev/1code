import { useState } from "react"
import { Music, VolumeX, Loader2 } from "lucide-react"
import { cn } from "../../../lib/utils"

interface AudioPreviewProps {
  filePath: string
  className?: string
}

export function AudioPreview({ filePath, className }: AudioPreviewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Use local-file:// protocol for streaming audio access
  // Format: local-file://localhost/<absolute-path>
  // Ensure path starts with / for proper URL format (Windows paths like D:\... need leading /)
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`
  const fileUrl = `local-file://localhost${normalizedPath}`
  // Use cross-platform path split
  const fileName = filePath.split(/[\\/]/).pop() || filePath

  const handleLoadedData = () => {
    setIsLoading(false)
    setHasError(false)
  }

  const handleError = () => {
    console.error("[AudioPreview] Failed to load:", fileUrl)
    setIsLoading(false)
    setHasError(true)
  }

  if (hasError) {
    return (
      <div className={cn("h-full w-full flex flex-col items-center justify-center gap-3 text-muted-foreground", className)}>
        <VolumeX className="h-12 w-12 opacity-40" />
        <p className="text-sm">Unable to play audio</p>
        <p className="text-xs text-muted-foreground/60 max-w-[300px] truncate">{filePath}</p>
      </div>
    )
  }

  return (
    <div className={cn("h-full w-full flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-muted/20 to-muted/40", className)}>
      {/* Album art placeholder */}
      <div className="w-48 h-48 rounded-lg bg-muted/50 flex items-center justify-center shadow-lg">
        <Music className="h-20 w-20 text-muted-foreground/40" />
      </div>

      {/* File name */}
      <p className="text-sm font-medium text-foreground max-w-[300px] truncate">
        {fileName}
      </p>

      {/* Audio player */}
      <div className="w-full max-w-md px-6 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <audio
          src={fileUrl}
          className={cn("w-full", isLoading && "opacity-0")}
          controls
          controlsList="nodownload"
          onLoadedData={handleLoadedData}
          onError={handleError}
        />
      </div>
    </div>
  )
}
