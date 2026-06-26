import { useAtom, useAtomValue } from "jotai"
import { AlertCircle, Check, Loader2, PanelRightOpen, X } from "lucide-react"
import { useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  IconFullPage,
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
import { APP_META } from "../../../../shared/external-apps"
import { fileViewerDisplayModeAtom } from "../../agents/atoms"
import { getFileIconByExtension } from "../../agents/mentions/agents-file-mention"
import { getFileName } from "../utils/file-utils"

const FILE_VIEWER_MODES = [
  { value: "details-expanded" as const, labelKey: "fileViewer.detailsExpanded" as TranslationKey, Icon: PanelRightOpen },
  { value: "full-page" as const, labelKey: "changes.diff.fullscreen" as TranslationKey, Icon: IconFullPage },
]

interface ImageViewerProps {
  filePath: string
  projectPath: string
  onClose: () => void
}

export function ImageViewer({
  filePath,
  projectPath,
  onClose,
}: ImageViewerProps) {
  const { t } = useI18n()
  const fileName = getFileName(filePath)
  const [displayMode, setDisplayMode] = useAtom(fileViewerDisplayModeAtom)
  const preferredEditor = useAtomValue(preferredEditorAtom)
  const editorMeta = APP_META[preferredEditor]
  const openInAppMutation = trpc.external.openInApp.useMutation()
  const openInEditorHotkey = useResolvedHotkeyDisplay("open-in-editor")

  const absolutePath = useMemo(() => {
    return filePath.startsWith("/") ? filePath : `${projectPath}/${filePath}`
  }, [filePath, projectPath])

  const handleOpenInEditor = useCallback(() => {
    if (absolutePath) {
      openInAppMutation.mutate({ path: absolutePath, app: preferredEditor })
    }
  }, [absolutePath, preferredEditor, openInAppMutation])

  const { data, isLoading, error } = trpc.files.readBinaryFile.useQuery(
    { filePath: absolutePath, projectPath },
    { staleTime: 60000 },
  )

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
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
              {FILE_VIEWER_MODES.map(({ value, labelKey, Icon }) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => setDisplayMode(value)}
                  className="flex items-center gap-2"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="flex-1">{t(labelKey)}</span>
                  {displayMode === value && (
                    <Check className="size-4 text-muted-foreground ml-auto" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-2 min-w-0 flex-1 ml-1">
            {(() => {
              const Icon = getFileIconByExtension(filePath)
              return Icon ? <Icon className="h-3.5 w-3.5 flex-shrink-0" /> : null
            })()}
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
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-muted/20 p-4">
        {isLoading && (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">{t("fileViewer.loadingImage")}</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">
              {t("fileViewer.failedLoadImage")}
            </p>
          </div>
        )}

        {data && !data.ok && (
          <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">
              {data.reason === "too-large"
                ? t("fileViewer.imageTooLarge")
                : t("fileViewer.imageNotFound")}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {data.reason === "too-large"
                ? t("fileViewer.imageTooLargeDescription")
                : t("fileViewer.fileNotFoundDescription")}
            </p>
          </div>
        )}

        {data?.ok && (
          <img
            src={`data:${data.mimeType};base64,${data.data}`}
            alt={fileName}
            className="max-w-full max-h-full object-contain rounded-sm"
            style={{ imageRendering: "auto" }}
          />
        )}
      </div>
    </div>
  )
}
