import { useState } from "react"
import { ZoomIn, ZoomOut, RotateCw, ImageOff, Loader2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { Button } from "../../../components/ui/button"

interface ImagePreviewProps {
  filePath: string
  className?: string
}

export function ImagePreview({ filePath, className }: ImagePreviewProps) {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Use local-file:// protocol for streaming file access
  // Format: local-file://localhost/<absolute-path>
  // Using "localhost" as hostname to prevent URL path normalization issues
  // Ensure path starts with / for proper URL format (Windows paths like D:\... need leading /)
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`
  const fileUrl = `local-file://localhost${normalizedPath}`

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 3))
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.25))
  const handleRotate = () => setRotation((r) => (r + 90) % 360)

  const handleLoad = () => {
    setIsLoading(false)
    setHasError(false)
  }

  const handleError = () => {
    console.error("[ImagePreview] Failed to load:", fileUrl)
    setIsLoading(false)
    setHasError(true)
  }

  if (hasError) {
    return (
      <div className={cn("h-full w-full flex flex-col items-center justify-center gap-3 text-muted-foreground", className)}>
        <ImageOff className="h-12 w-12 opacity-40" />
        <p className="text-sm">Unable to load image</p>
        <p className="text-xs text-muted-foreground/60 max-w-[300px] truncate">{filePath}</p>
      </div>
    )
  }

  return (
    <div className={cn("h-full w-full flex flex-col", className)}>
      {/* Controls */}
      <div className="flex items-center justify-center gap-1 p-2 border-b bg-muted/30">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} disabled={isLoading}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-12 text-center">
          {Math.round(scale * 100)}%
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} disabled={isLoading}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRotate} disabled={isLoading}>
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Image container */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#1a1a1a] relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        <img
          src={fileUrl}
          alt="Preview"
          className={cn(
            "max-w-full max-h-full object-contain transition-transform duration-200",
            isLoading && "opacity-0"
          )}
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
          }}
          draggable={false}
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </div>
  )
}
