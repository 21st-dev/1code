import { useAtom, useSetAtom } from "jotai"
import { useCallback, useState } from "react"
import { X, ExternalLink, Maximize2, Minimize2, Pencil, Save, Eye } from "lucide-react"
import { cn } from "../../../lib/utils"
import { isMacOS } from "../../../lib/utils/platform"
import { Button } from "../../../components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../../components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog"
import { getFileIconByExtension } from "../../agents/mentions/agents-file-mention"
import { FilePreview } from "./file-preview"
import { trpc } from "../../../lib/trpc"
import {
  filePreviewPathAtom,
  filePreviewOpenAtom,
  filePreviewDisplayModeAtom,
  filePreviewLineAtom,
  filePreviewHighlightAtom,
  editorModeAtom,
  editorDirtyAtom,
  resetEditorStateAtom,
} from "../atoms"

// File types that support editing
const EDITABLE_EXTENSIONS = new Set([
  // JavaScript/TypeScript
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  // Web
  "css", "scss", "sass", "less", "vue", "svelte",
  // Data formats
  "json", "jsonc", "json5", "yaml", "yml", "toml", "xml",
  // Shell/Scripts
  "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
  // Python
  "py", "pyw", "pyi",
  // Other languages
  "rb", "php", "java", "kt", "kts", "swift", "go", "rs",
  "c", "h", "cpp", "cc", "cxx", "hpp", "cs", "fs",
  "scala", "clj", "ex", "exs", "lua", "r", "dart", "sql",
  // Config files
  "ini", "conf", "env", "gitignore", "editorconfig",
  // Docs
  "md", "mdx", "txt", "rst",
])

function isFileEditable(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || ""
  return EDITABLE_EXTENSIONS.has(ext)
}

interface FilePreviewDialogProps {
  className?: string
}

export function FilePreviewDialog({ className }: FilePreviewDialogProps) {
  const [open, setOpen] = useAtom(filePreviewOpenAtom)
  const [filePath, setFilePath] = useAtom(filePreviewPathAtom)
  const [displayMode, setDisplayMode] = useAtom(filePreviewDisplayModeAtom)
  const [scrollToLine, setScrollToLine] = useAtom(filePreviewLineAtom)
  const [highlightText, setHighlightText] = useAtom(filePreviewHighlightAtom)
  const [editorMode, setEditorMode] = useAtom(editorModeAtom)
  const [isDirty, setIsDirty] = useAtom(editorDirtyAtom)
  const resetEditorState = useSetAtom(resetEditorStateAtom)

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [pendingCloseAction, setPendingCloseAction] = useState<(() => void) | null>(null)

  // Use cross-platform path split
  const pathParts = filePath?.split(/[\\/]/) || []
  const fileName = pathParts.pop() || ""
  const dirPath = pathParts.join("/") || ""
  const FileIcon = fileName ? (getFileIconByExtension(fileName) ?? null) : null
  const canEdit = fileName ? isFileEditable(fileName) : false
  const isEditing = editorMode === "edit"

  // Handle close with unsaved changes check
  const handleClose = useCallback(() => {
    if (isDirty) {
      setPendingCloseAction(() => () => {
        resetEditorState()
        setFilePath(null)
        setScrollToLine(null)
        setHighlightText(null)
      })
      setShowUnsavedDialog(true)
    } else {
      resetEditorState()
      setFilePath(null)
      setScrollToLine(null)
      setHighlightText(null)
    }
  }, [isDirty, resetEditorState, setFilePath, setScrollToLine, setHighlightText])

  // Toggle between view and edit mode
  const handleToggleEdit = useCallback(() => {
    if (isEditing && isDirty) {
      // Switching from edit to view with unsaved changes
      setPendingCloseAction(() => () => {
        setEditorMode("view")
        setIsDirty(false)
      })
      setShowUnsavedDialog(true)
    } else {
      setEditorMode(isEditing ? "view" : "edit")
    }
  }, [isEditing, isDirty, setEditorMode, setIsDirty])

  // Handle save
  const handleSave = useCallback(() => {
    // Call the save function exposed by CodeEditor
    const saveFunc = (window as any).__codeEditorSave
    if (saveFunc) {
      saveFunc()
    }
  }, [])

  // Handle unsaved dialog actions
  const handleDiscardChanges = useCallback(() => {
    setShowUnsavedDialog(false)
    setIsDirty(false)
    if (pendingCloseAction) {
      pendingCloseAction()
      setPendingCloseAction(null)
    }
  }, [pendingCloseAction, setIsDirty])

  const handleSaveAndClose = useCallback(async () => {
    setShowUnsavedDialog(false)
    handleSave()
    // Wait a bit for save to complete, then execute pending action
    setTimeout(() => {
      if (pendingCloseAction) {
        pendingCloseAction()
        setPendingCloseAction(null)
      }
    }, 100)
  }, [pendingCloseAction, handleSave])

  const handleCancelClose = useCallback(() => {
    setShowUnsavedDialog(false)
    setPendingCloseAction(null)
  }, [])

  const openInFinderMutation = trpc.external.openInFinder.useMutation()

  const handleOpenExternal = () => {
    if (filePath) {
      openInFinderMutation.mutate(filePath)
    }
  }

  const handleToggleFullscreen = () => {
    setDisplayMode(displayMode === "full-page" ? "dialog" : "full-page")
  }

  // Callback when dirty state changes in editor
  const handleDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [setIsDirty])

  // Callback when file is saved
  const handleFileSaved = useCallback(() => {
    // Optionally show a toast or notification
    console.log("[FilePreviewDialog] File saved")
  }, [])

  if (!filePath) return null

  const isMac = isMacOS()

  // Edit/Save button component
  const EditSaveButton = () => {
    if (!canEdit) return null

    if (isEditing) {
      return (
        <>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", isDirty && "text-yellow-500")}
            onClick={handleSave}
            disabled={!isDirty}
            title={isDirty ? "Save (Cmd+S)" : "No changes to save"}
          >
            <Save className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleToggleEdit}
            title="Switch to View Mode"
          >
            <Eye className="h-4 w-4" />
          </Button>
        </>
      )
    }

    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleToggleEdit}
        title="Edit File"
      >
        <Pencil className="h-4 w-4" />
      </Button>
    )
  }

  // Unsaved changes dialog
  const UnsavedChangesDialog = () => (
    <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Do you want to save them before closing?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancelClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleDiscardChanges}
          >
            Discard
          </AlertDialogAction>
          <AlertDialogAction onClick={handleSaveAndClose}>Save</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // Full page mode
  if (displayMode === "full-page") {
    return (
      <div className={cn("fixed inset-0 z-50 bg-background flex flex-col", className)}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          {/* macOS: Left side has close + fullscreen buttons */}
          {isMac && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose} title="Close">
                <X className="h-4 w-4" />
              </Button>

              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleToggleFullscreen} title="Exit Fullscreen">
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* File info - center on macOS, left on Windows */}
          <div className={cn(
            "flex items-center gap-2 min-w-0",
            isMac && "flex-1 justify-center"
          )}>
            {FileIcon && <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            <span className="text-sm font-medium truncate">{fileName}</span>
            {dirPath && (
              <span className="text-xs text-muted-foreground truncate hidden sm:block">
                {dirPath}
              </span>
            )}
          </div>

          {/* macOS: Right side has edit/save + "Show in Finder" */}
          {isMac ? (
            <div className="flex items-center gap-1">
              <EditSaveButton />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpenExternal} title="Show in Finder">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            /* Windows: Right side has all buttons - edit/save, external, fullscreen, close */
            <div className="flex items-center gap-1">
              <EditSaveButton />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpenExternal} title="Show in Explorer">
                <ExternalLink className="h-4 w-4" />
              </Button>

              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleToggleFullscreen} title="Exit Fullscreen">
                <Minimize2 className="h-4 w-4" />
              </Button>

              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <FilePreview
            filePath={filePath}
            editable={isEditing}
            onSave={handleFileSaved}
            onDirtyChange={handleDirtyChange}
            scrollToLine={scrollToLine}
            highlightText={highlightText}
          />
        </div>

        <UnsavedChangesDialog />
      </div>
    )
  }

  // Dialog mode (default)
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent
        className={cn(
          "max-w-4xl w-[90vw] h-[80vh] p-0 gap-0 flex flex-col overflow-hidden",
          className
        )}
        showCloseButton={false}
        aria-describedby={undefined}
      >
          {/* Accessibility: Hidden title for screen readers */}
          <VisuallyHidden>
            <DialogTitle>File Preview: {fileName}</DialogTitle>
          </VisuallyHidden>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 flex-shrink-0">
            {/* macOS: Left side has close + fullscreen buttons */}
            {isMac && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose} title="Close">
                  <X className="h-4 w-4" />
                </Button>

                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleToggleFullscreen} title="Fullscreen">
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* File info - center on macOS, left on Windows */}
            <div className={cn(
              "flex items-center gap-2 min-w-0",
              isMac && "flex-1 justify-center"
            )}>
              {FileIcon && <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
              <span className="text-sm font-medium truncate">{fileName}</span>
              {dirPath && (
                <span className="text-xs text-muted-foreground truncate hidden sm:block">
                  {dirPath}
                </span>
              )}
            </div>

            {/* macOS: Right side has edit/save + "Show in Finder" */}
            {isMac ? (
              <div className="flex items-center gap-1">
                <EditSaveButton />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpenExternal} title="Show in Finder">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              /* Windows: Right side has all buttons - edit/save, external, fullscreen, close */
              <div className="flex items-center gap-1">
                <EditSaveButton />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpenExternal} title="Show in Explorer">
                  <ExternalLink className="h-4 w-4" />
                </Button>

                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleToggleFullscreen} title="Fullscreen">
                  <Maximize2 className="h-4 w-4" />
                </Button>

                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose} title="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            <FilePreview
              filePath={filePath}
              editable={isEditing}
              onSave={handleFileSaved}
              onDirtyChange={handleDirtyChange}
              scrollToLine={scrollToLine}
              highlightText={highlightText}
            />
          </div>

          <UnsavedChangesDialog />
        </DialogContent>
    </Dialog>
  )
}

// Hook to open file preview
export function useFilePreview() {
  const [, setFilePath] = useAtom(filePreviewPathAtom)

  return {
    openPreview: (path: string) => setFilePath(path),
    closePreview: () => setFilePath(null),
  }
}
