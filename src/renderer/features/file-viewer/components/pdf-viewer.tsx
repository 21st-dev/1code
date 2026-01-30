import { useMemo } from "react"
import { X, ExternalLink, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface PdfViewerProps {
  filePath: string
  projectPath: string
  onClose: () => void
}

/**
 * Get file name from path
 */
function getFileName(filePath: string): string {
  const parts = filePath.split("/")
  return parts[parts.length - 1] || filePath
}

/**
 * PdfViewer - Uses Chrome's native PDF viewer via iframe
 */
export function PdfViewer({
  filePath,
  projectPath,
  onClose,
}: PdfViewerProps) {
  const fileName = getFileName(filePath)

  // Build absolute path
  const absolutePath = useMemo(() => {
    return filePath.startsWith("/") ? filePath : `${projectPath}/${filePath}`
  }, [filePath, projectPath])

  // Use file:// protocol for local PDF
  const pdfUrl = useMemo(() => {
    return `file://${absolutePath}`
  }, [absolutePath])

  // Open in system viewer
  const handleOpenExternal = () => {
    window.desktopApi?.openPath(absolutePath)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 border-b bg-background flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium truncate" title={filePath}>
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Open externally */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleOpenExternal}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open in system viewer</TooltipContent>
          </Tooltip>
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF iframe */}
      <div className="flex-1 min-h-0">
        <iframe
          src={pdfUrl}
          className="w-full h-full border-0"
          title="PDF Viewer"
        />
      </div>
    </div>
  )
}
