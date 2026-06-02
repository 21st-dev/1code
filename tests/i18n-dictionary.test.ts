import { describe, expect, test } from "bun:test"
import { en, zhCN } from "../src/renderer/lib/i18n/dictionaries"

describe("i18n dictionary parity", () => {
  test("Simplified Chinese dictionary has the same keys as English", () => {
    const enKeys = Object.keys(en).sort()
    const zhKeys = Object.keys(zhCN).sort()
    const missingInZh = enKeys.filter((key) => !zhKeys.includes(key))
    const extraInZh = zhKeys.filter((key) => !enKeys.includes(key))

    expect(missingInZh).toEqual([])
    expect(extraInZh).toEqual([])
    expect(zhKeys.length).toBe(enKeys.length)
  })

  test("all dictionary values are non-empty strings", () => {
    const emptyEnglish = Object.entries(en)
      .filter(([, value]) => !String(value).trim())
      .map(([key]) => key)
    const emptyChinese = Object.entries(zhCN)
      .filter(([, value]) => !String(value).trim())
      .map(([key]) => key)

    expect(emptyEnglish).toEqual([])
    expect(emptyChinese).toEqual([])
  })

  test("English dictionary keeps the default labels in English", () => {
    expect(en["sidebar.workspaces"]).toBe("Workspaces")
    expect(en["chat.defaultTitle"]).toBe("New Chat")
    expect(en["chat.creatingWorktree"]).toBe("Creating worktree...")
  })

  test("Simplified Chinese localizes first-run visible labels and prompts", () => {
    const expectedChinese = {
      "settings.sidebar.models": "模型",
      "settings.sidebar.commands": "命令",
      "settings.sidebar.skills": "技能",
      "settings.sidebar.plugins": "插件",
      "settings.preferences.subtitle": "配置智能体行为和应用功能",
      "settings.skills.viewCommands": "命令",
      "sidebar.kanbanView": "看板视图",
      "sidebar.searchWorkspaces": "搜索工作区...",
      "sidebar.newWorkspace": "新建工作区",
      "sidebar.workspaces": "工作区",
      "chat.defaultTitle": "新对话",
      "chat.creatingWorktree": "正在创建工作树...",
      "chat.placeholder.agentMode": "让智能体执行，@ 添加上下文，/ 输入命令",
      "usage.title": "用量",
      "details.details": "详情",
      "details.files": "文件",
      "details.branch": "分支",
      "details.mcpSettings": "MCP 设置",
      "settings.mcp.searchPlaceholder": "搜索服务器...",
      "settings.mcp.scopeClaudeGlobal": "全局 (~/.claude.json)",
      "settings.plugins.viewSources": "来源",
      "settings.plugins.viewStore": "Locus 商店",
      "settings.plugins.storeApproveExact": "批准精确候选",
      "settings.commands.officialSnapshotLastUpdated": "上次更新",
      "agent.pastedText.pastChat": "历史对话",
      "agent.textSelection.addToContext": "添加到上下文",
      "agent.chat.searchChats": "搜索对话...",
      "onboarding.claude.localLoginOpening":
        "正在浏览器中打开 Anthropic 登录页。登录后请把完整授权码粘贴到这里。",
    }

    for (const [key, expected] of Object.entries(expectedChinese)) {
      expect(zhCN[key as keyof typeof en]).toBe(expected)
    }
  })
})
