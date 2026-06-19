import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { en, zhCN } from "../src/renderer/lib/i18n/dictionaries"

function getFunctionBlock(source: string, functionName: string): string {
  const start = source.indexOf(`const ${functionName}`)
  expect(start).toBeGreaterThan(0)
  const nextFunction = source
    .slice(start + functionName.length)
    .search(/\n\n {2}const [a-zA-Z0-9]+/)
  return source.slice(
    start,
    nextFunction === -1
      ? undefined
      : start + functionName.length + nextFunction,
  )
}

describe("Settings MCP Codex logout failure UX", () => {
  test("explains Claude and Codex MCP capability asymmetry in the detail panel", () => {
    const source = readFileSync(
      "src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx",
      "utf8",
    )

    expect(source).toContain("settings.mcp.runtimeBehavior")
    expect(source).toContain("settings.mcp.claudeRuntimeBehaviorDescription")
    expect(source).toContain("settings.mcp.codexRuntimeBehaviorDescription")

    expect(en["settings.mcp.claudeRuntimeBehaviorDescription"]).toContain(
      "in-place update path",
    )
    expect(en["settings.mcp.claudeRuntimeBehaviorDescription"]).toContain(
      "separate MCP logout action is not exposed",
    )
    expect(en["settings.mcp.codexRuntimeBehaviorDescription"]).toContain(
      "remove and add the server again",
    )
    expect(en["settings.mcp.codexRuntimeBehaviorDescription"]).toContain(
      "OAuth credentials",
    )

    expect(zhCN["settings.mcp.claudeRuntimeBehaviorDescription"]).toContain(
      "原地更新路径",
    )
    expect(zhCN["settings.mcp.claudeRuntimeBehaviorDescription"]).toContain(
      "不提供单独的 MCP 退出登录",
    )
    expect(zhCN["settings.mcp.codexRuntimeBehaviorDescription"]).toContain(
      "删除后重新添加",
    )
    expect(zhCN["settings.mcp.codexRuntimeBehaviorDescription"]).toContain(
      "OAuth 凭据",
    )
  })

  test("keeps Codex logout failure honest and retryable", () => {
    const source = readFileSync(
      "src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx",
      "utf8",
    )
    const logoutBlock = getFunctionBlock(source, "handleCodexAuthLogout")
    const successBranch = logoutBlock.slice(
      logoutBlock.indexOf("if (result.success)"),
      logoutBlock.indexOf("} else {"),
    )
    const failureBranch = logoutBlock.slice(
      logoutBlock.indexOf("} else {"),
      logoutBlock.indexOf("} catch"),
    )

    expect(successBranch).toContain('await handleRefresh(true, "codex")')
    expect(failureBranch).toContain("showFailure")
    expect(failureBranch).not.toContain("handleRefresh")
    expect(logoutBlock).toContain("setCodexLogoutFailure")

    expect(source).toContain("codexLogoutFailure={selectedCodexLogoutFailure}")
    expect(source).toContain("settings.mcp.retryLogout")
    expect(source).toContain("settings.mcp.codexLogoutManualCleanup")
    expect(source).toContain("settings.mcp.codexLogoutFailureSourceValue")
  })

  test("localizes Codex logout failure source and manual cleanup guidance", () => {
    expect(en["settings.mcp.toast.codexLogoutFailedDescription"]).toContain(
      "OAuth credentials may still exist",
    )
    expect(en["settings.mcp.codexLogoutFailureSourceValue"]).toContain(
      "Codex CLI/keyring",
    )
    expect(en["settings.mcp.codexLogoutManualCleanupDescription"]).toContain(
      "Locus will not delete Codex credentials directly",
    )

    expect(zhCN["settings.mcp.toast.codexLogoutFailedDescription"]).toContain(
      "OAuth 凭据可能仍然存在",
    )
    expect(zhCN["settings.mcp.codexLogoutFailureSourceValue"]).toContain(
      "Codex CLI/keyring",
    )
    expect(zhCN["settings.mcp.codexLogoutManualCleanupDescription"]).toContain(
      "Locus 不会直接删除 Codex 凭据",
    )
  })
})
