import { useState } from "react"
import { VideoOff, Loader2 } from "lucide-react"
import { cn } from "../../../lib/utils"

interface VideoPreviewProps {
  filePath: string
  className?: string
}

export function VideoPreview({ filePath, className }: VideoPreviewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Use local-file:// protocol for streaming video access
  // Format: local-file://localhost/<absolute-path>
  // Ensure path starts with / for proper URL format (Windows paths like D:\... need leading /)
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`
  const fileUrl = `local-file://localhost${normalizedPath}`

  const handleLoadedData = () => {
    setIsLoading(false)
    setHasError(false)
  }

  const handleError = () => {
    console.error("[VideoPreview] Failed to load:", fileUrl)
    setIsLoading(false)
    setHasError(true)
  }

  if (hasError) {
    return (
      <div className={cn("h-full w-full flex flex-col items-center justify-center gap-3 text-muted-foreground", className)}>
        <VideoOff className="h-12 w-12 opacity-40" />
        <p className="text-sm">Unable to play video</p>
        <p className="text-xs text-muted-foreground/60 max-w-[300px] truncate">{filePath}</p>
      </div>
    )
  }

  return (
    <div className={cn("h-full w-full flex flex-col bg-black relative", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="h-8 w-8 animate-spin text-white/60" />
        </div>
      )}
      <video
        src={fileUrl}
        className={cn(
          "flex-1 w-full h-full object-contain",
          isLoading && "opacity-0"
        )}
        controls
        controlsList="nodownload"
        onLoadedData={handleLoadedData}
        onError={handleError}
      />
    </div>
  )
}
