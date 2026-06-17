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
    expect(source).toContain("<DiffSidebarRenderer")
    expect(expandedSidebar).toContain(
      "parsedFileDiffs={parsedFileDiffs ?? undefined}",
    )
    expect(expandedSidebar).not.toContain("onOpenFullDiff={")
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
