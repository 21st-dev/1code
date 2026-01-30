import { useCallback, useEffect, useMemo, useState } from "react"
import Editor from "@monaco-editor/react"
import { useAtom } from "jotai"
import { useTheme } from "next-themes"
import {
  Loader2,
  WrapText,
  AlertCircle,
  FileWarning,
  Copy,
  Check,
} from "lucide-react"
import { getFileIconByExtension } from "../../agents/mentions/agents-file-mention"
import { IconCloseSidebarRight } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ViewerErrorBoundary } from "@/components/ui/error-boundary"
import { cn } from "@/lib/utils"
import { fileViewerWordWrapAtom } from "../../agents/atoms"
import { useFileContent, getErrorMessage } from "../hooks/use-file-content"
import { getMonacoLanguage, getFileViewerType } from "../utils/language-map"
import { getFileName, formatFileSize } from "../utils/file-utils"
import { defaultEditorOptions, getMonacoTheme } from "./monaco-config"
import { ImageViewer } from "./image-viewer"
import { MarkdownViewer } from "./markdown-viewer"
import { PdfViewer } from "./pdf-viewer"
import { HtmlViewer } from "./html-viewer"

interface FileViewerSidebarProps {
  filePath: string
  projectPath: string
  onClose: () => void
}

/**
 * File icon based on file path
 */
function FileIcon({ filePath }: { filePath: string }) {
  const Icon = getFileIconByExtension(filePath)
  return Icon ? <Icon className="h-4 w-4" /> : null
}

/**
 * Loading spinner component
 */
function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Loading file...</span>
      </div>
    </div>
  )
}

/**
 * Error display component
 */
function ErrorDisplay({
  error,
}: {
  error: string
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium text-foreground">{error}</p>
      </div>
    </div>
  )
}

/**
 * Unsupported file viewer - for binary files, PDFs, etc.
 */
function UnsupportedViewer({
  filePath,
  onClose,
}: {
  filePath: string
  onClose: () => void
}) {
  const fileName = getFileName(filePath)

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-3 h-10 border-b bg-background flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileIcon filePath={filePath} />
          <span className="text-sm font-medium truncate" title={filePath}>
            {fileName}
          </span>
        </div>
        <Button
          variant="ghost"
          className="h-6 w-6 p-0 hover:bg-muted transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md ml-1"
          onClick={onClose}
        >
          <IconCloseSidebarRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
          <FileWarning className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">Cannot view this file</p>
        </div>
      </div>
    </div>
  )
}

/**
 * Header component for the sidebar
 */
function Header({
  fileName,
  filePath,
  byteLength,
  wordWrap,
  onToggleWordWrap,
  onClose,
  content,
}: {
  fileName: string
  filePath: string
  byteLength: number | null
  wordWrap: boolean
  onToggleWordWrap: () => void
  onClose: () => void
  content?: string | null
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }, [content])

  return (
    <div className="flex items-center justify-between px-3 h-10 border-b bg-background flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <FileIcon filePath={filePath} />
        <span className="text-sm font-medium truncate" title={filePath}>
          {fileName}
        </span>
        {byteLength !== null && (
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {formatFileSize(byteLength)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Copy file content */}
        {content && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {copied ? "Copied!" : "Copy file content"}
            </TooltipContent>
          </Tooltip>
        )}
        {/* Word wrap toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                wordWrap && "bg-muted"
              )}
              onClick={onToggleWordWrap}
            >
              <WrapText className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {wordWrap ? "Disable word wrap" : "Enable word wrap"}
          </TooltipContent>
        </Tooltip>
        {/* Close button */}
        <Button
          variant="ghost"
          className="h-6 w-6 p-0 hover:bg-muted transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md ml-1"
          onClick={onClose}
        >
          <IconCloseSidebarRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    </div>
  )
}

/**
 * FileViewerSidebar - Routes to appropriate viewer based on file type
 * Wrapped with error boundaries for crash protection
 */
export function FileViewerSidebar({
  filePath,
  projectPath,
  onClose,
}: FileViewerSidebarProps) {
  const viewerType = getFileViewerType(filePath)

  // Route to specialized viewers for non-code files
  // Each viewer is wrapped in an error boundary for crash protection
  switch (viewerType) {
    case "image":
      return (
        <ViewerErrorBoundary viewerType="image" onReset={onClose}>
          <ImageViewer
            filePath={filePath}
            projectPath={projectPath}
            onClose={onClose}
          />
        </ViewerErrorBoundary>
      )
    case "unsupported":
      return (
        <UnsupportedViewer
          filePath={filePath}
          onClose={onClose}
        />
      )
    case "markdown":
      return (
        <ViewerErrorBoundary viewerType="markdown" onReset={onClose}>
          <MarkdownViewer
            filePath={filePath}
            projectPath={projectPath}
            onClose={onClose}
          />
        </ViewerErrorBoundary>
      )
    case "pdf":
      return (
        <ViewerErrorBoundary viewerType="pdf" onReset={onClose}>
          <PdfViewer
            filePath={filePath}
            projectPath={projectPath}
            onClose={onClose}
          />
        </ViewerErrorBoundary>
      )
    case "html":
      return (
        <ViewerErrorBoundary viewerType="html" onReset={onClose}>
          <HtmlViewer
            filePath={filePath}
            projectPath={projectPath}
            onClose={onClose}
          />
        </ViewerErrorBoundary>
      )
    default:
      return (
        <ViewerErrorBoundary viewerType="file" onReset={onClose}>
          <CodeViewer
            filePath={filePath}
            projectPath={projectPath}
            onClose={onClose}
          />
        </ViewerErrorBoundary>
      )
  }
}

/**
 * CodeViewer - Monaco Editor-based code viewer (default)
 */
function CodeViewer({
  filePath,
  projectPath,
  onClose,
}: {
  filePath: string
  projectPath: string
  onClose: () => void
}) {
  const fileName = getFileName(filePath)
  const language = getMonacoLanguage(filePath)
  const { resolvedTheme } = useTheme()
  const monacoTheme = getMonacoTheme(resolvedTheme || "dark")

  // Word wrap preference
  const [wordWrap, setWordWrap] = useAtom(fileViewerWordWrapAtom)

  // Load file content
  const { content, isLoading, error, byteLength, refetch } = useFileContent(
    projectPath,
    filePath
  )

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // Toggle word wrap
  const handleToggleWordWrap = useCallback(() => {
    setWordWrap(!wordWrap)
  }, [wordWrap, setWordWrap])

  // Editor options with word wrap setting
  const editorOptions = useMemo(
    () => ({
      ...defaultEditorOptions,
      wordWrap: wordWrap ? ("on" as const) : ("off" as const),
    }),
    [wordWrap]
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-background">
        <Header
          fileName={fileName}
          filePath={filePath}
          byteLength={null}
          wordWrap={wordWrap}
          onToggleWordWrap={handleToggleWordWrap}
          onClose={onClose}
        />
        <LoadingSpinner />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col h-full bg-background">
        <Header
          fileName={fileName}
          filePath={filePath}
          byteLength={null}
          wordWrap={wordWrap}
          onToggleWordWrap={handleToggleWordWrap}
          onClose={onClose}
        />
        <ErrorDisplay error={getErrorMessage(error)} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <Header
        fileName={fileName}
        filePath={filePath}
        byteLength={byteLength}
        wordWrap={wordWrap}
        onToggleWordWrap={handleToggleWordWrap}
        onClose={onClose}
        content={content}
      />
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={language}
          value={content || ""}
          theme={monacoTheme}
          options={editorOptions}
          loading={<LoadingSpinner />}
        />
      </div>
    </div>
  )
}
