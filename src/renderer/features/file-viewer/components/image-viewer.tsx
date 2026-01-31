import { useMemo, useCallback } from "react"
import { Loader2, AlertCircle, Check, X } from "lucide-react"
import { useAtom, useAtomValue } from "jotai"
import { Button } from "@/components/ui/button"
import {
  IconCloseSidebarRight,
  IconSidePeek,
  IconCenterPeek,
  IconFullPage,
} from "@/components/ui/icons"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { trpc } from "@/lib/trpc"
import { preferredEditorAtom } from "@/lib/atoms"
import { useResolvedHotkeyDisplay } from "@/lib/hotkeys"
import { APP_META } from "../../../../shared/external-apps"
import { EDITOR_ICONS } from "@/lib/editor-icons"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { fileViewerDisplayModeAtom } from "../../agents/atoms"
import { getFileIconByExtension } from "../../agents/mentions/agents-file-mention"
import { getFileName } from "../utils/file-utils"

const FILE_VIEWER_MODES = [
  { value: "side-peek" as const, label: "Sidebar", Icon: IconSidePeek },
  { value: "center-peek" as const, label: "Dialog", Icon: IconCenterPeek },
  { value: "full-page" as const, label: "Fullscreen", Icon: IconFullPage },
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
    { filePath: absolutePath },
    { staleTime: 60000 },
  )

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-2 h-10 border-b border-border/50 bg-background flex-shrink-0">
        {/* Left side: Close + mode switcher + file info */}
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
          {/* Display mode switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
              >
                {(() => {
                  const CurrentIcon = FILE_VIEWER_MODES.find((m) => m.value === displayMode)?.Icon ?? IconSidePeek
                  return <CurrentIcon className="size-4 text-muted-foreground" />
                })()}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[140px]">
              {FILE_VIEWER_MODES.map(({ value, label, Icon }) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => setDisplayMode(value)}
                  className="flex items-center gap-2"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="flex-1">{label}</span>
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
                {EDITOR_ICONS[preferredEditor] && (
                  <img
                    src={EDITOR_ICONS[preferredEditor]}
                    alt=""
                    className="h-3.5 w-3.5 flex-shrink-0"
                  />
                )}
                <span>Open in {editorMeta.label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" showArrow={false}>
              Open in {editorMeta.label}
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
            <span className="text-sm">Loading image...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">Failed to load image</p>
          </div>
        )}

        {data && !data.ok && (
          <div className="flex flex-col items-center gap-3 text-center max-w-[300px]">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">
              {data.reason === "too-large" ? "Image too large" : "Image not found"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {data.reason === "too-large"
                ? "The image exceeds the 20MB size limit."
                : "The file could not be found."}
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
