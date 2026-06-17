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

  test("normalizes terminal side-peek to Details and preserves bottom panel", () => {
    const source = read("src/renderer/features/agents/main/active-chat.tsx")
    const terminalAtoms = read("src/renderer/features/terminal/atoms.ts")
    const terminalSidebar = read(
      "src/renderer/features/terminal/terminal-sidebar.tsx",
    )

    expect(terminalAtoms).toContain(
      'export type TerminalDisplayMode = "details" | "bottom"',
    )
    expect(terminalAtoms).toContain(
      'type LegacyTerminalDisplayMode = "side-peek"',
    )
    expect(terminalAtoms).toContain(
      'return mode === "bottom" ? "bottom" : "details"',
    )
    expect(terminalSidebar).toContain('value: "details" as const')
    expect(terminalSidebar).toContain('value: "bottom" as const')
    expect(terminalSidebar).not.toContain('value: "side-peek" as const')
    expect(terminalSidebar).not.toContain("<ResizableSidebar")
    expect(source).toContain('terminalDisplayMode === "bottom"')
    expect(source).toContain("<TerminalBottomPanelContent")
    expect(source).toContain('openDetailsWidget("terminal", { toggle: true })')
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
})
