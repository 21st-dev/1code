import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = join(__dirname, "..")

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf-8")
}

describe("details sidebar entrypoints", () => {
  test("routes terminal and diff hotkeys through unified toggle handlers", () => {
    const source = read("src/renderer/features/agents/main/active-chat.tsx")
    const cmdJSection = source.slice(
      source.indexOf("// Keyboard shortcut: Cmd+J"),
      source.indexOf("// Diff data cache"),
    )
    const cmdDSection = source.slice(
      source.indexOf("// Keyboard shortcut: Cmd + D"),
      source.indexOf("// Keyboard shortcut: Cmd + Shift + E"),
    )

    expect(source).toContain('openDetailsWidget("terminal", { toggle: true })')
    expect(source).toContain('openDetailsWidget("diff", { toggle: true })')
    expect(cmdJSection).toContain("handleToggleTerminalProductEntry()")
    expect(cmdJSection).not.toContain("handleOpenTerminalProductEntry()")
    expect(cmdDSection).toContain("handleToggleDiffProductEntry()")
    expect(cmdDSection).not.toContain(
      "setIsDiffSidebarOpen(!isDiffSidebarOpen)",
    )
  })

  test("keeps expanded diff actions in the unified renderer", () => {
    const source = read("src/renderer/features/agents/main/active-chat.tsx")
    const rendererSection = source.slice(
      source.indexOf("// DiffSidebarRenderer"),
      source.indexOf("// Inner chat component"),
    )
    const diffSection = read(
      "src/renderer/features/details-sidebar/sections/diff-section.tsx",
    )
    const expandedSidebar = read(
      "src/renderer/features/details-sidebar/expanded-widget-sidebar.tsx",
    )

    expect(diffSection).toContain("const visibleFiles = files")
    expect(diffSection).not.toContain("onOpenFullDiff")
    expect(diffSection).not.toContain("setIsDiffSidebarOpen")
    expect(diffSection).not.toContain("isExpanded")
    expect(diffSection).not.toContain(
      "onClick={() => setIsDiffSidebarOpen(true)}",
    )
    expect(source).toContain("renderDiffContent={({ onClose }) => (")
    expect(source).toContain('diffDisplayMode="details-expanded"')
    expect(source).toContain('diffDisplayMode="full-page"')
    expect(source).toContain("<DiffSidebarRenderer")
    expect(rendererSection).toContain('diffDisplayMode === "details-expanded"')
    expect(rendererSection).toContain('diffDisplayMode === "full-page"')
    expect(rendererSection).not.toContain('diffDisplayMode === "side-peek"')
    expect(rendererSection).not.toContain('diffDisplayMode === "center-peek"')
    expect(expandedSidebar).toContain(
      "parsedFileDiffs={parsedFileDiffs ?? undefined}",
    )
    expect(expandedSidebar).not.toContain("onOpenFullDiff={")
  })

  test("normalizes legacy diff display modes away from side and dialog", () => {
    const atoms = read("src/renderer/features/agents/atoms/index.ts")
    const switcher = read(
      "src/renderer/features/changes/components/diff-sidebar-header/diff-view-mode-switcher.tsx",
    )

    expect(atoms).toContain(
      'export type DiffViewDisplayMode = "details-expanded" | "full-page"',
    )
    expect(atoms).toContain(
      'type LegacyDiffViewDisplayMode = "side-peek" | "center-peek"',
    )
    expect(atoms).toContain(
      'return mode === "full-page" ? "full-page" : "details-expanded"',
    )
    expect(atoms).not.toContain("agentsDiffSidebarWidthAtom")
    expect(atoms).not.toContain("agentsDiffSidebarOpenAtom")
    expect(switcher).toContain('value: "details-expanded" as const')
    expect(switcher).toContain('value: "full-page" as const')
    expect(switcher).not.toContain('value: "side-peek" as const')
    expect(switcher).not.toContain('value: "center-peek" as const')
  })

  test("uses environment-first default Details widget order", () => {
    const atoms = read("src/renderer/features/details-sidebar/atoms/index.ts")
    const registrySection = atoms.slice(
      atoms.indexOf("export const WIDGET_REGISTRY"),
      atoms.indexOf("// Helper to get default visible widgets"),
    )
    const widgetIds = Array.from(
      registrySection.matchAll(/id: "([^"]+)"/g),
      (match) => match[1],
    )

    expect(widgetIds).toEqual([
      "info",
      "diff",
      "todo",
      "plan",
      "mcp",
      "trace",
      "usage",
      "error",
      "terminal",
      "browser",
      "file",
    ])
    expect(atoms).toContain(
      "get(widgetVisibilityStorageAtom)[workspaceId] ?? DEFAULT_VISIBLE_WIDGETS",
    )
    expect(atoms).toContain(
      "get(widgetOrderStorageAtom)[workspaceId] ?? DEFAULT_WIDGET_ORDER",
    )
  })

  test("keeps folderless quick chats out of repository Details surfaces", () => {
    const source = read("src/renderer/features/agents/main/active-chat.tsx")

    expect(source).toMatch(/worktreePath && \(\s*<ExpandedWidgetSidebar/)
    expect(source).toMatch(/worktreePath && \(\s*<DetailsSidebar/)
    expect(source).toMatch(/worktreePath &&\s*!\s*isDetailsSidebarOpen/)
    expect(source).toContain("isFolderlessChat")
    expect(source).toContain("quickChat.attachFolder")
    expect(source).not.toContain("projectId === null")
  })

  test("separates user Details opens from context auto-open policy", () => {
    const atoms = read("src/renderer/features/details-sidebar/atoms/index.ts")
    const openDetailsWidget = read(
      "src/renderer/features/details-sidebar/use-open-details-widget.ts",
    )
    const detailsSidebar = read(
      "src/renderer/features/details-sidebar/details-sidebar.tsx",
    )
    const source = read("src/renderer/features/agents/main/active-chat.tsx")
    const planTool = read(
      "src/renderer/features/agents/ui/agent-plan-file-tool.tsx",
    )

    expect(atoms).toContain("detailsSidebarAutoOpenSuppressedAtom")
    expect(openDetailsWidget).toContain('source?: "user" | "context"')
    expect(openDetailsWidget).toContain(
      'type DetailsWidgetOpenReason = "plan-produced" | "run-error"',
    )
    expect(openDetailsWidget).toContain("isFolderlessChat?: boolean")
    expect(openDetailsWidget).toContain("CONTEXT_AUTO_OPEN_REASONS")
    expect(openDetailsWidget).toContain('options?.source === "context"')
    expect(openDetailsWidget).toContain("setDetailsSidebarOpen(true)")
    expect(openDetailsWidget).toContain(
      "setDetailsSidebarAutoOpenSuppressed(false)",
    )
    expect(detailsSidebar).toContain(
      "setDetailsSidebarAutoOpenSuppressed(true)",
    )
    expect(source).toContain("handleOpenDetailsSidebar")
    expect(source).toContain("setDetailsSidebarAutoOpenSuppressed(false)")
    expect(planTool).toContain('source: "context"')
    expect(planTool).toContain('reason: "plan-produced"')
  })

  test("defaults terminal side-peek to bottom and preserves Details opt-in", () => {
    const source = read("src/renderer/features/agents/main/active-chat.tsx")
    const terminalAtoms = read("src/renderer/features/terminal/atoms.ts")
    const terminalSidebar = read(
      "src/renderer/features/terminal/terminal-sidebar.tsx",
    )
    const terminalWidget = read(
      "src/renderer/features/details-sidebar/sections/terminal-widget.tsx",
    )
    const terminalSection = read(
      "src/renderer/features/details-sidebar/sections/terminal-section.tsx",
    )
    const terminalModeSwitcher = read(
      "src/renderer/features/terminal/terminal-mode-switcher.tsx",
    )

    expect(terminalAtoms).toContain(
      'export type TerminalDisplayMode = "details" | "bottom"',
    )
    expect(terminalAtoms).toContain(
      'type LegacyTerminalDisplayMode = "side-peek"',
    )
    expect(terminalAtoms).toContain(
      'return mode === "details" ? "details" : "bottom"',
    )
    expect(terminalAtoms).toContain(
      '"terminal-display-mode",\n  "bottom"',
    )
    expect(terminalModeSwitcher).toContain('value: "details" as const')
    expect(terminalModeSwitcher).toContain('value: "bottom" as const')
    expect(terminalModeSwitcher).not.toContain('value: "side-peek" as const')
    expect(terminalWidget).toContain("<TerminalModeSwitcher")
    expect(terminalWidget).toContain('if (displayMode === "bottom")')
    expect(terminalWidget).toContain("handleOpenBottomPanel")
    expect(terminalWidget).toContain("setBottomPanelOpen(true)")
    expect(terminalWidget).toContain("<IconBottomPanel")
    expect(terminalSection).toContain("<TerminalModeSwitcher")
    expect(terminalSection).toContain("setBottomPanelOpen(true)")
    expect(terminalSidebar).toContain("<TerminalModeSwitcher")
    expect(terminalSidebar).not.toContain("<ResizableSidebar")
    expect(source).toContain('terminalDisplayMode === "bottom"')
    expect(source).toContain("<TerminalBottomPanelContent")
    expect(source).toContain('openDetailsWidget("terminal", { toggle: true })')
  })

  test("promotes Details changes commit and push without duplicating git owners", () => {
    const source = read("src/renderer/features/agents/main/active-chat.tsx")
    const detailsSidebar = read(
      "src/renderer/features/details-sidebar/details-sidebar.tsx",
    )
    const changesWidget = read(
      "src/renderer/features/details-sidebar/sections/changes-widget.tsx",
    )

    expect(changesWidget).toContain("import { CommitInput }")
    expect(changesWidget).toContain("import { usePushAction }")
    expect(changesWidget).toContain("<CommitInput")
    expect(changesWidget).toContain("selectedFilePaths={selectedFilePaths}")
    expect(changesWidget).toContain("onRefresh={onRefresh ?? (() => {})}")
    expect(changesWidget).toContain("const pushActionButton")
    expect(changesWidget).toContain('syncActionKind === "publish"')
    expect(changesWidget).toContain('syncActionKind === "push"')
    expect(changesWidget).toContain("onSuccess: onRefresh")
    expect(detailsSidebar).toContain("onChangesRefresh?: () => void")
    expect(detailsSidebar).toContain("onRefresh={onChangesRefresh}")
    expect(source).toContain("onChangesRefresh={handleCommitChangesRefresh}")

    for (const content of [source, detailsSidebar, changesWidget]) {
      expect(content).not.toContain("onCommitAndPush")
      expect(content).not.toContain("handleCommitAndPush")
      expect(content).not.toContain("shouldCommitAndPush")
    }

    expect(source).not.toContain("usePushAction")
    expect(changesWidget).not.toContain("trpc.changes.pull")
    expect(changesWidget).not.toContain("forcePush")
    expect(changesWidget).not.toContain("mergeFromDefault")
    expect(changesWidget).toContain("setIsCreateDraftPrDialogOpen(true)")
    expect(changesWidget).toContain("createDraftPrMutation.mutateAsync")
  })

  test("keeps in-chat git readouts as message-level provenance", () => {
    const gitActivityBadges = read(
      "src/renderer/features/agents/ui/git-activity-badges.tsx",
    )
    const subChatStatusCard = read(
      "src/renderer/features/agents/ui/sub-chat-status-card.tsx",
    )

    expect(gitActivityBadges).toContain("message-level git provenance")
    expect(gitActivityBadges).toContain("extractGitActivity(parts)")
    expect(gitActivityBadges).toContain("extractChangedFiles(parts")
    expect(gitActivityBadges).toContain('openDetailsWidget("diff")')
    expect(gitActivityBadges).not.toContain("currentBranch")
    expect(subChatStatusCard).toContain("sub-chat file provenance")
    expect(subChatStatusCard).toContain("uncommittedFiles")
    expect(subChatStatusCard).toContain('openDetailsWidget("diff")')
    expect(subChatStatusCard).not.toContain("currentBranch")
  })

  test("does not keep legacy right-sidebar fallback paths", () => {
    const source = read("src/renderer/features/agents/main/active-chat.tsx")
    const detailsAtoms = read("src/renderer/features/details-sidebar/atoms/index.ts")
    const openDetailsWidget = read(
      "src/renderer/features/details-sidebar/use-open-details-widget.ts",
    )
    const subChatSelector = read(
      "src/renderer/features/agents/ui/sub-chat-selector.tsx",
    )

    for (const content of [
      source,
      detailsAtoms,
      openDetailsWidget,
      subChatSelector,
    ]) {
      expect(content).not.toContain("unifiedSidebarEnabledAtom")
      expect(content).not.toContain("!isUnifiedSidebarEnabled")
    }

    expect(source).not.toContain("useAgentPanelConflicts")
    expect(source).not.toContain("AgentPlanSidebar")
    expect(source).not.toContain("<TerminalSidebar")
    expect(source).toMatch(/<ExpandedWidgetSidebar[\s\S]*renderDiffContent=/)
    expect(source).toMatch(/<DetailsSidebar[\s\S]*onExpandPlan=/)
    expect(source).toMatch(/<DetailsSidebar[\s\S]*onExpandTerminal=/)
    expect(source).toMatch(/<DetailsSidebar[\s\S]*onExpandDiff=/)
    expect(openDetailsWidget).toContain('setDetailsSidebarTab("details")')
  })

  test("folds local browser through Details ownership", () => {
    const source = read("src/renderer/features/agents/main/active-chat.tsx")
    const agentsAtoms = read("src/renderer/features/agents/atoms/index.ts")
    const detailsAtoms = read("src/renderer/features/details-sidebar/atoms/index.ts")
    const detailsSidebar = read(
      "src/renderer/features/details-sidebar/details-sidebar.tsx",
    )
    const expandedSidebar = read(
      "src/renderer/features/details-sidebar/expanded-widget-sidebar.tsx",
    )

    expect(detailsAtoms).toContain('| "browser"')
    expect(detailsAtoms).toContain('id: "browser"')
    expect(detailsAtoms).toContain('labelKey: "localBrowser.title"')
    expect(detailsAtoms).toContain("canExpand: true")
    expect(detailsSidebar).toContain('case "browser":')
    expect(detailsSidebar).toContain("<BrowserWidget")
    expect(expandedSidebar).toContain("renderBrowserContent")
    expect(expandedSidebar).toContain('case "browser":')
    expect(source).toContain('openDetailsWidget("browser")')
    expect(source).toMatch(/<ExpandedWidgetSidebar[\s\S]*renderBrowserContent=/)
    expect(source).toContain("<LocalBrowserWorkbench")
    expect(source).toContain("onInsertReport={handleInsertLocalBrowserReport}")
    expect(source).toContain("setPendingActiveLocalBrowserReport(report)")
    expect(source).toContain("pendingLocalBrowserReport")
    expect(source).toContain("editorRef.current?.setValue")
    expect(source).not.toContain("localBrowserWorkbenchOpenAtomFamily")
    expect(source).not.toContain("localBrowserWorkbenchWidthAtom")
    expect(agentsAtoms).not.toContain("localBrowserWorkbenchOpenAtomFamily")
    expect(agentsAtoms).not.toContain("localBrowserWorkbenchWidthAtom")
    expect(agentsAtoms).toContain("pendingLocalBrowserReportAtomFamily")
  })

  test("folds file viewer through Details selected-file ownership", () => {
    const source = read("src/renderer/features/agents/main/active-chat.tsx")
    const agentsAtoms = read("src/renderer/features/agents/atoms/index.ts")
    const detailsAtoms = read("src/renderer/features/details-sidebar/atoms/index.ts")
    const detailsSidebar = read(
      "src/renderer/features/details-sidebar/details-sidebar.tsx",
    )
    const expandedSidebar = read(
      "src/renderer/features/details-sidebar/expanded-widget-sidebar.tsx",
    )
    const fileViewerSidebar = read(
      "src/renderer/features/file-viewer/components/file-viewer-sidebar.tsx",
    )
    const markdownViewer = read(
      "src/renderer/features/file-viewer/components/markdown-viewer.tsx",
    )
    const imageViewer = read(
      "src/renderer/features/file-viewer/components/image-viewer.tsx",
    )
    const fileSearchDialog = read(
      "src/renderer/features/file-viewer/components/file-search-dialog.tsx",
    )
    const changesWidget = read(
      "src/renderer/features/details-sidebar/sections/changes-widget.tsx",
    )
    const changesView = read("src/renderer/features/changes/changes-view.tsx")
    const agentDiffView = read(
      "src/renderer/features/agents/ui/agent-diff-view.tsx",
    )

    expect(detailsAtoms).toContain('| "file"')
    expect(detailsAtoms).toContain('id: "file"')
    expect(detailsAtoms).toContain('labelKey: "fileViewer.title"')
    expect(detailsAtoms).toContain("selectedFileAtomFamily")
    expect(detailsAtoms).toContain("recentlyOpenedFilesAtom")
    expect(detailsSidebar).toContain("selectedFileAtomFamily")
    expect(detailsSidebar).toContain("currentViewerFilePath={selectedFilePath}")
    expect(expandedSidebar).toContain("renderFileContent")
    expect(expandedSidebar).toContain('case "file":')

    expect(agentsAtoms).toContain(
      'export type FileViewerDisplayMode = "details-expanded" | "full-page"',
    )
    expect(agentsAtoms).toContain(
      'type LegacyFileViewerDisplayMode = "side-peek" | "center-peek"',
    )
    expect(agentsAtoms).toContain("normalizeFileViewerDisplayMode")
    expect(agentsAtoms).not.toContain("fileViewerOpenAtomFamily")
    expect(agentsAtoms).not.toContain("fileViewerSidebarWidthAtom")
    expect(agentsAtoms).not.toContain("recentlyOpenedFilesAtom")

    expect(source).toContain("selectedFileAtomFamily")
    expect(source).toContain("handleOpenDetailsFile")
    expect(source).toContain("<FileOpenProvider onOpenFile={handleOpenDetailsFile}>")
    expect(source).toContain("onSelectFile={handleOpenDetailsFile}")
    expect(source).toMatch(/<ExpandedWidgetSidebar[\s\S]*renderFileContent=/)
    expect(source).toContain('openDetailsWidget("file")')
    expect(source).toContain('fileViewerDisplayMode === "full-page"')
    expect(source).not.toContain('fileViewerDisplayMode === "side-peek"')
    expect(source).not.toContain('fileViewerDisplayMode === "center-peek"')

    for (const content of [
      fileViewerSidebar,
      markdownViewer,
      imageViewer,
    ]) {
      expect(content).toContain('value: "details-expanded" as const')
      expect(content).toContain('value: "full-page" as const')
      expect(content).not.toContain('value: "side-peek" as const')
      expect(content).not.toContain('value: "center-peek" as const')
    }

    expect(fileSearchDialog).toContain(
      'from "../../details-sidebar/atoms"',
    )

    for (const content of [
      source,
      detailsSidebar,
      changesWidget,
      changesView,
      agentDiffView,
    ]) {
      expect(content).not.toContain("fileViewerOpenAtomFamily")
      expect(content).not.toContain("setFileViewerPath")
    }

    expect(changesWidget).toContain("selectedFileAtomFamily")
    expect(changesWidget).toContain('openDetailsWidget("file")')
    expect(changesView).toContain("selectedFileAtomFamily")
    expect(changesView).toContain('openDetailsWidget("file")')
    expect(agentDiffView).toContain("selectedFileAtomFamily")
    expect(agentDiffView).toContain('openDetailsWidget("file")')
  })
})
