import { useCallback, useEffect, useMemo } from "react"
import { useAtom } from "jotai"
import { useAtomValue } from "jotai"
import {
  Loader2,
  AlertCircle,
  FileWarning,
  MoreHorizontal,
  WrapText,
  Check,
  X,
} from "lucide-react"
import { getFileIconByExtension } from "../../agents/mentions/agents-file-mention"
import {
  IconCloseSidebarRight,
  IconSidePeek,
  IconCenterPeek,
  IconFullPage,
  IconLineNumbers,
} from "@/components/ui/icons"
import { Kbd } from "@/components/ui/kbd"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { ViewerErrorBoundary } from "@/components/ui/error-boundary"
import { trpc } from "@/lib/trpc"
import { preferredEditorAtom } from "@/lib/atoms"
import { useResolvedHotkeyDisplay } from "@/lib/hotkeys"
import { APP_META } from "../../../../shared/external-apps"
import { CopyButton } from "../../agents/ui/message-action-buttons"
import { EDITOR_ICONS } from "@/lib/editor-icons"
import {
  fileViewerWordWrapAtom,
  fileViewerLineNumbersAtom,
  fileViewerDisplayModeAtom,
  type FileViewerDisplayMode,
} from "../../agents/atoms"
import { useFileContent, getErrorMessage } from "../hooks/use-file-content"
import { getFileViewerType } from "../utils/language-map"
import { getFileName } from "../utils/file-utils"
import { ImageViewer } from "./image-viewer"
import { MarkdownViewer } from "./markdown-viewer"
import { useI18n, type TranslationKey } from "@/lib/i18n"

interface FileViewerSidebarProps {
  filePath: string
  projectPath: string
  onClose: () => void
}

function FileIcon({ filePath }: { filePath: string }) {
  const Icon = getFileIconByExtension(filePath)
  return Icon ? <Icon className="h-3.5 w-3.5" /> : null
}

const FILE_VIEWER_MODES = [
  { value: "side-peek" as const, labelKey: "changes.diff.sidebar" as TranslationKey, Icon: IconSidePeek },
  { value: "center-peek" as const, labelKey: "changes.diff.dialog" as TranslationKey, Icon: IconCenterPeek },
  { value: "full-page" as const, labelKey: "changes.diff.fullscreen" as TranslationKey, Icon: IconFullPage },
]

function FileViewerModeSwitcher({
  mode,
  onModeChange,
}: {
  mode: FileViewerDisplayMode
  onModeChange: (mode: FileViewerDisplayMode) => void
}) {
  const { t } = useI18n()
  const currentMode = FILE_VIEWER_MODES.find((m) => m.value === mode) ?? FILE_VIEWER_MODES[0]
  const CurrentIcon = currentMode.Icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
        >
          <CurrentIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {FILE_VIEWER_MODES.map(({ value, labelKey, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => onModeChange(value)}
            className="flex items-center gap-2"
          >
            <Icon className="size-4 text-muted-foreground" />
            <span className="flex-1">{t(labelKey)}</span>
            {mode === value && (
              <Check className="size-4 text-muted-foreground ml-auto" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LoadingSpinner() {
  const { t } = useI18n()
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">{t("fileViewer.loadingFile")}</span>
      </div>
    </div>
  )
}

function ErrorDisplay({ error }: { error: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium text-foreground">{error}</p>
      </div>
    </div>
  )
}

function UnsupportedViewer({
  filePath,
  onClose,
}: {
  filePath: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const fileName = getFileName(filePath)
  const [displayMode, setDisplayMode] = useAtom(fileViewerDisplayModeAtom)

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-2 h-10 border-b border-border/50 bg-background flex-shrink-0">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {/* Close + mode switcher on the left */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
            onClick={onClose}
          >
            {displayMode === "side-peek" ? (
              <IconCloseSidebarRight className="size-4 text-muted-foreground" />
            ) : (
              <X className="size-4 text-muted-foreground" />
            )}
          </Button>
          <FileViewerModeSwitcher
            mode={displayMode}
            onModeChange={setDisplayMode}
          />
          <div className="flex items-center gap-2 min-w-0 flex-1 ml-1">
            <FileIcon filePath={filePath} />
            <span className="text-sm font-medium truncate" title={filePath}>
              {fileName}
            </span>
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
          <FileWarning className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">
            {t("fileViewer.cannotView")}
          </p>
        </div>
      </div>
    </div>
  )
}

function CodeViewerHeader({
  fileName,
  filePath,
  onClose,
  content,
}: {
  fileName: string
  filePath: string
  onClose: () => void
  content?: string | null
}) {
  const { t } = useI18n()
  const [wordWrap, setWordWrap] = useAtom(fileViewerWordWrapAtom)
  const [lineNumbers, setLineNumbers] = useAtom(fileViewerLineNumbersAtom)
  const [displayMode, setDisplayMode] = useAtom(fileViewerDisplayModeAtom)
  const preferredEditor = useAtomValue(preferredEditorAtom)
  const editorMeta = APP_META[preferredEditor]
  const openInAppMutation = trpc.external.openInApp.useMutation()
  const openInEditorHotkey = useResolvedHotkeyDisplay("open-file-in-editor")

  const handleOpenInEditor = useCallback(() => {
    const absolutePath = filePath.startsWith("/") ? filePath : undefined
    if (absolutePath) {
      openInAppMutation.mutate({ path: absolutePath, app: preferredEditor })
    }
  }, [filePath, preferredEditor, openInAppMutation])

  return (
    <div className="@container flex items-center justify-between px-2 h-10 border-b border-border/50 bg-background flex-shrink-0">
      {/* Left side: Close button + mode switcher + file info */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
          onClick={onClose}
        >
          {displayMode === "side-peek" ? (
            <IconCloseSidebarRight className="size-4 text-muted-foreground" />
          ) : (
            <X className="size-4 text-muted-foreground" />
          )}
        </Button>
        <FileViewerModeSwitcher
          mode={displayMode}
          onModeChange={setDisplayMode}
        />
        <div className="flex items-center gap-2 min-w-0 flex-1 ml-1">
          <FileIcon filePath={filePath} />
          <span className="text-sm font-medium truncate" title={filePath}>
            {fileName}
          </span>
        </div>
      </div>
      {/* Right side: Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Open in editor */}
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleOpenInEditor}
              className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer rounded-md px-1.5 py-1 hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <span className="hidden @[400px]:inline">{t("details.openIn")}</span>
              {EDITOR_ICONS[preferredEditor] && (
                <img
                  src={EDITOR_ICONS[preferredEditor]}
                  alt=""
                  className="h-3.5 w-3.5 flex-shrink-0"
                />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" showArrow={false}>
            {t("changes.openInEditor", { editor: editorMeta.label })}
            {openInEditorHotkey && <Kbd className="normal-case font-sans">{openInEditorHotkey}</Kbd>}
          </TooltipContent>
        </Tooltip>

        {/* Copy button */}
        {content && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <CopyButton text={content} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" showArrow={false}>
              {t("fileViewer.copyContent")}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Options menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuCheckboxItem
              checked={wordWrap}
              onCheckedChange={() => setWordWrap(!wordWrap)}
            >
              <WrapText className="mr-2 h-3.5 w-3.5" />
              {t("fileViewer.wordWrap")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={lineNumbers}
              onCheckedChange={() => setLineNumbers(!lineNumbers)}
            >
              <IconLineNumbers className="mr-2 h-3.5 w-3.5" />
              {t("fileViewer.lineNumbers")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

/**
 * FileViewerSidebar - Routes to appropriate viewer based on file type
 */
export function FileViewerSidebar({
  filePath,
  projectPath,
  onClose,
}: FileViewerSidebarProps) {
  const viewerType = getFileViewerType(filePath)

  switch (viewerType) {
    case "image":
      return (
        <ViewerErrorBoundary viewerType="image" onReset={onClose}>
          <ImageViewer filePath={filePath} projectPath={projectPath} onClose={onClose} />
        </ViewerErrorBoundary>
      )
    case "unsupported":
      return <UnsupportedViewer filePath={filePath} onClose={onClose} />
    case "markdown":
      return (
        <ViewerErrorBoundary viewerType="markdown" onReset={onClose}>
          <MarkdownViewer filePath={filePath} projectPath={projectPath} onClose={onClose} />
        </ViewerErrorBoundary>
      )
    default:
      return (
        <ViewerErrorBoundary viewerType="file" onReset={onClose}>
          <CodeViewer filePath={filePath} projectPath={projectPath} onClose={onClose} />
        </ViewerErrorBoundary>
      )
  }
}

/**
 * CodeViewer - lightweight read-only code viewer.
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
  const [wordWrap] = useAtom(fileViewerWordWrapAtom)
  const [lineNumbers] = useAtom(fileViewerLineNumbersAtom)
  const preferredEditor = useAtomValue(preferredEditorAtom)
  const openInAppMutation = trpc.external.openInApp.useMutation()
  const { content, isLoading, error } = useFileContent(projectPath, filePath)
  const lines = useMemo(() => (content ?? "").split("\n"), [content])

  // Handle ⌘⇧O hotkey to open current file in external editor
  useEffect(() => {
    const handler = () => {
      const absolutePath = filePath.startsWith("/") ? filePath : undefined
      if (absolutePath) {
        openInAppMutation.mutate({ path: absolutePath, app: preferredEditor })
      }
    }
    window.addEventListener("open-file-in-editor", handler)
    return () => window.removeEventListener("open-file-in-editor", handler)
  }, [filePath, preferredEditor, openInAppMutation])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-background">
        <CodeViewerHeader
          fileName={fileName}
          filePath={filePath}

          onClose={onClose}
        />
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full bg-background">
        <CodeViewerHeader
          fileName={fileName}
          filePath={filePath}

          onClose={onClose}
        />
        <ErrorDisplay error={getErrorMessage(error)} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <CodeViewerHeader
        fileName={fileName}
        filePath={filePath}

        onClose={onClose}
        content={content}
      />
      <div
        className="flex-1 min-h-0 overflow-auto allow-text-selection bg-muted/20"
        data-file-viewer-path={filePath}
      >
        <pre
          className={cn(
            "m-0 min-w-full p-3 font-mono text-xs leading-5 text-foreground",
            wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
          )}
        >
          {lineNumbers
            ? lines.map((line, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3"
                >
                  <span className="select-none text-right tabular-nums text-muted-foreground/60">
                    {index + 1}
                  </span>
                  <code>{line || " "}</code>
                </div>
              ))
            : <code>{content || ""}</code>}
        </pre>
      </div>
    </div>
  )
}
