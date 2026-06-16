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
    expect(expandedSidebar).toContain(
      "parsedFileDiffs={parsedFileDiffs ?? undefined}",
    )
    expect(expandedSidebar).not.toContain("onOpenFullDiff={")
  })

  test("mounts legacy Plan, Diff, and Terminal sidebars only behind the rollback flag", () => {
    const source = read("src/renderer/features/agents/main/active-chat.tsx")

    expect(source).toMatch(
      /Plan Sidebar[\s\S]*\{!isUnifiedSidebarEnabled && !isMobileFullscreen && activeSubChatIdForPlan &&/,
    )
    expect(source).toMatch(
      /Diff View[\s\S]*\{!isUnifiedSidebarEnabled && canOpenDiff && !isMobileFullscreen &&/,
    )
    expect(source).toMatch(
      /Terminal Sidebar[\s\S]*\{!isUnifiedSidebarEnabled && worktreePath &&/,
    )
    expect(source).toMatch(
      /Terminal Bottom Panel[\s\S]*terminalDisplayMode === "bottom" && !isUnifiedSidebarEnabled &&/,
    )
  })
})
