import { useAtom, useAtomValue } from "jotai"
import { AlertCircle, Check, Loader2, PanelRightOpen, X } from "lucide-react"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChatMarkdownRenderer } from "@/components/chat-markdown-renderer"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  CodeIcon,
  IconFullPage,
  MarkdownIcon,
} from "@/components/ui/icons"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { preferredEditorAtom } from "@/lib/atoms"
import { EDITOR_ICONS } from "@/lib/editor-icons"
import { useResolvedHotkeyDisplay } from "@/lib/hotkeys"
import { type TranslationKey, useI18n } from "@/lib/i18n"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"
import { APP_META } from "../../../../shared/external-apps"
import { fileViewerDisplayModeAtom, fileViewerWordWrapAtom } from "../../agents/atoms"
import { getFileIconByExtension } from "../../agents/mentions/agents-file-mention"
import { CopyButton } from "../../agents/ui/message-action-buttons"
import { shouldUseMonacoPreview } from "./code-viewer-limits"
import {
  LazyMonacoCodeViewer,
  scheduleMonacoCodeViewerPreload,
} from "./monaco-preview-loader"
import { PlainCodeBlock } from "./plain-code-block"

const FILE_VIEWER_MODES = [
  { value: "details-expanded" as const, labelKey: "fileViewer.detailsExpanded" as TranslationKey, Icon: PanelRightOpen },
  { value: "full-page" as const, labelKey: "changes.diff.fullscreen" as TranslationKey, Icon: IconFullPage },
]

import { getFileName } from "../utils/file-utils"

interface MarkdownViewerProps {
  filePath: string
  projectPath: string
  onClose: () => void
}

export function MarkdownViewer({
  filePath,
  projectPath,
  onClose,
}: MarkdownViewerProps) {
  const { t } = useI18n()
  const fileName = getFileName(filePath)

  const [showPreview, setShowPreview] = useState(true)
  const [wordWrap] = useAtom(fileViewerWordWrapAtom)

  const handleToggleView = useCallback(() => {
    setShowPreview((prev) => !prev)
  }, [])

  useEffect(() => {
    if (!showPreview) {
      scheduleMonacoCodeViewerPreload()
    }
  }, [showPreview])

  const absolutePath = useMemo(() => {
    return filePath.startsWith("/") ? filePath : `${projectPath}/${filePath}`
  }, [filePath, projectPath])

  const { data, isLoading, error, refetch } = trpc.files.readTextFile.useQuery(
    { filePath: absolutePath, projectPath },
    { staleTime: 30000 },
  )

  const refetchRef = useRef(refetch)
  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  const relativePath = useMemo(() => {
    if (!filePath.startsWith("/")) return filePath
    if (filePath.startsWith(projectPath)) {
      return filePath.slice(projectPath.length + 1)
    }
    return filePath
  }, [projectPath, filePath])

  trpc.files.watchChanges.useSubscription(
    { projectPath },
    {
      enabled: !!projectPath && !!relativePath,
      onData: (change) => {
        if (change.filename === relativePath) {
          refetchRef.current()
        }
      },
    },
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.querySelector("[data-file-viewer-path] .find-widget.visible")) return
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
        <Header
          fileName={fileName}
          filePath={filePath}
          showPreview={showPreview}
          onToggleView={handleToggleView}
          onClose={onClose}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">{t("fileViewer.loadingFile")}</span>
          </div>
        </div>
      </div>
    )
  }

  if (error || (data && !data.ok)) {
    let errorMessage = t("fileViewer.failedLoadFile")
    if (data && !data.ok) {
      errorMessage = data.reason === "too-large"
        ? t("fileViewer.fileTooLarge")
        : data.reason === "binary"
        ? t("fileViewer.binaryFile")
        : t("fileViewer.fileNotFound")
    }

    return (
      <div className="flex flex-col h-full bg-background">
        <Header
          fileName={fileName}
          filePath={filePath}
          showPreview={showPreview}
          onToggleView={handleToggleView}
          onClose={onClose}
        />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">{errorMessage}</p>
          </div>
        </div>
      </div>
    )
  }

  const content = data?.ok ? data.content : ""
  const byteLength = data?.ok ? data.byteLength : null

  return (
    <div className="flex flex-col h-full bg-background">
      <Header
        fileName={fileName}
        filePath={filePath}
        showPreview={showPreview}
        onToggleView={handleToggleView}
        onClose={onClose}
        content={content}
      />
      <div
        className="flex-1 min-h-0 overflow-hidden allow-text-selection"
        data-file-viewer-path={filePath}
      >
        {showPreview ? (
          <div className="h-full overflow-auto p-6">
            <ChatMarkdownRenderer
              content={content}
              size="md"
            />
          </div>
        ) : (
          shouldUseMonacoPreview(byteLength, content) ? (
            <Suspense fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }>
              <LazyMonacoCodeViewer
                filePath={filePath}
                content={content}
                language="markdown"
                wordWrap={wordWrap}
                minimap={false}
                lineNumbers
                onClose={onClose}
              />
            </Suspense>
          ) : (
            <PlainCodeBlock
              content={content}
              wordWrap={wordWrap}
              lineNumbers
            />
          )
        )}
      </div>
    </div>
  )
}

function Header({
  fileName,
  filePath,
  showPreview,
  onToggleView,
  onClose,
  content,
}: {
  fileName: string
  filePath: string
  showPreview: boolean
  onToggleView: () => void
  onClose: () => void
  content?: string
}) {
  const { t } = useI18n()
  const Icon = getFileIconByExtension(filePath)
  const [displayMode, setDisplayMode] = useAtom(fileViewerDisplayModeAtom)
  const preferredEditor = useAtomValue(preferredEditorAtom)
  const editorMeta = APP_META[preferredEditor]
  const openInAppMutation = trpc.external.openInApp.useMutation()
  const openInEditorHotkey = useResolvedHotkeyDisplay("open-in-editor")

  const handleOpenInEditor = useCallback(() => {
    const absolutePath = filePath.startsWith("/") ? filePath : undefined
    if (absolutePath) {
      openInAppMutation.mutate({ path: absolutePath, app: preferredEditor })
    }
  }, [filePath, preferredEditor, openInAppMutation])

  return (
    <div className="@container flex items-center justify-between px-2 h-10 border-b border-border/50 bg-background flex-shrink-0">
      {/* Left side: Close + mode switcher + file info */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
          onClick={onClose}
        >
          <X className="size-4 text-muted-foreground" />
        </Button>
        {/* Display mode switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
            >
              {(() => {
                const CurrentIcon = FILE_VIEWER_MODES.find((m) => m.value === displayMode)?.Icon ?? PanelRightOpen
                return <CurrentIcon className="size-4 text-muted-foreground" />
              })()}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[140px]">
            {FILE_VIEWER_MODES.map(({ value, labelKey, Icon: ModeIcon }) => (
              <DropdownMenuItem
                key={value}
                onClick={() => setDisplayMode(value)}
                className="flex items-center gap-2"
              >
                <ModeIcon className="size-4 text-muted-foreground" />
                <span className="flex-1">{t(labelKey)}</span>
                {displayMode === value && (
                  <Check className="size-4 text-muted-foreground ml-auto" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-2 min-w-0 flex-1 ml-1">
          {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
          <span className="text-sm font-medium truncate">{fileName}</span>
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

        {/* View mode toggle */}
        {content && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleView}
                className="h-6 w-6 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
                aria-label={showPreview ? t("fileViewer.showSource") : t("fileViewer.showRendered")}
              >
                <div className="relative w-4 h-4">
                  <MarkdownIcon
                    className={cn(
                      "absolute inset-0 w-4 h-4 transition-[opacity,transform] duration-200 ease-out",
                      showPreview ? "opacity-100 scale-100" : "opacity-0 scale-75",
                    )}
                  />
                  <CodeIcon
                    className={cn(
                      "absolute inset-0 w-4 h-4 transition-[opacity,transform] duration-200 ease-out",
                      !showPreview ? "opacity-100 scale-100" : "opacity-0 scale-75",
                    )}
                  />
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" showArrow={false}>
              {showPreview ? t("fileViewer.viewSource") : t("fileViewer.viewRendered")}
            </TooltipContent>
          </Tooltip>
        )}

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
      </div>
    </div>
  )
}
