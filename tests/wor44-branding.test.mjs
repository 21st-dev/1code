import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const root = join(__dirname, "..")

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8")
}

test("package metadata uses OpenCodex product branding", () => {
  const packageJson = read("package.json")
  assert.match(packageJson, /"description": "OpenCodex - UI-first local coding workstation"/)
  assert.match(packageJson, /"productName": "OpenCodex"/)
  assert.match(packageJson, /"name": "opencodex-desktop"/)
})

test("main process product chrome uses OpenCodex language", () => {
  const mainSource = read("src/main/index.ts")
  const windowsSource = read("src/main/windows/main.ts")

  assert.match(mainSource, /applicationName: "OpenCodex"/)
  assert.match(mainSource, /label: "About OpenCodex"/)
  assert.match(mainSource, /title>OpenCodex - Authentication</)
  assert.match(mainSource, /Starting OpenCodex/)
  assert.match(mainSource, /bundled runtime version/)
  assert.doesNotMatch(mainSource, /About 1Code/)
  assert.doesNotMatch(mainSource, /title>1Code - Authentication</)
  assert.doesNotMatch(mainSource, /Starting 1Code/)
  assert.doesNotMatch(mainSource, /Claude Code version/)

  assert.doesNotMatch(windowsSource, /win\.setTitle\(`1Code \$\{count\}`\)/)
  assert.doesNotMatch(windowsSource, /win\.setTitle\("1Code"\)/)
  assert.match(windowsSource, /OpenCodex \(\$\{count\}\)/)
})

test("onboarding, login, and shell surfaces avoid Claude Code and Codex-first branding", () => {
  const billing = read("src/renderer/features/onboarding/billing-method-page.tsx")
  const anthropic = read("src/renderer/features/onboarding/anthropic-onboarding-page.tsx")
  const codex = read("src/renderer/features/agents/components/codex-login-content.tsx")
  const html = read("src/renderer/index.html")
  const titleBar = read("src/renderer/components/windows-title-bar.tsx")
  const sidebar = read("src/renderer/features/sidebar/agents-sidebar.tsx")

  assert.match(billing, /Set Up OpenCodex Backend/)
  assert.match(anthropic, /Connect Anthropic Runtime/)
  assert.match(codex, /Connect OpenCodex Runtime/)
  assert.match(html, /<title>OpenCodex<\/title>/)
  assert.match(titleBar, />OpenCodex</)
  assert.match(sidebar, /OpenCodex/)

  assert.doesNotMatch(billing, /Connect AI Provider/)
  assert.doesNotMatch(billing, /Claude Code/)
  assert.doesNotMatch(billing, /Codex Subscription/)
  assert.doesNotMatch(anthropic, /Connect Claude Code/)
  assert.doesNotMatch(codex, /Connect OpenAI Codex/)
})

test("settings and chooser surfaces present compatibility runtimes instead of Claude/Codex product brands", () => {
  const models = read("src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx")
  const mcp = read("src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx")
  const activeChat = read("src/renderer/features/agents/main/active-chat.tsx")
  const newChat = read("src/renderer/features/agents/main/new-chat-form.tsx")
  const automations = read("src/renderer/features/automations/_components/utils.ts")
  const templateCard = read("src/renderer/features/automations/_components/template-card.tsx")
  const transport = read("src/renderer/features/agents/lib/ipc-chat-transport.ts")
  const automationDetail = read("src/renderer/features/automations/automations-detail-view.tsx")

  assert.match(models, /Anthropic Runtime Accounts/)
  assert.match(models, /OpenAI-Compatible Runtime/)
  assert.match(mcp, /OpenAI-Compatible/)
  assert.match(mcp, /Anthropic-Compatible/)
  assert.match(activeChat, /Anthropic-Compatible/)
  assert.match(newChat, /OpenAI-Compatible/)
  assert.match(automations, /run OpenCodex runtime/)
  assert.match(templateCard, /run OpenCodex runtime/)
  assert.match(transport, /Anthropic runtime usage limit/)
  assert.match(transport, /Anthropic-compatible runtime/)
  assert.match(automationDetail, /Repository where the OpenCodex runtime will make changes/)

  assert.doesNotMatch(models, /Codex Account/)
  assert.doesNotMatch(models, /Manage your Codex account/)
  assert.doesNotMatch(mcp, />OpenAI Codex</)
  assert.doesNotMatch(mcp, />Claude Code</)
  assert.doesNotMatch(activeChat, /name: "Claude Code"/)
  assert.doesNotMatch(newChat, /name: "OpenAI Codex"/)
  assert.doesNotMatch(transport, /Claude Code/)
  assert.doesNotMatch(automationDetail, /Repository where Claude Code will make changes/)
})

test("renderer external links route through OpenCodex link constants instead of scattered legacy URLs", () => {
  const links = read("src/renderer/lib/opencodex-links.ts")
  const helpPopover = read("src/renderer/features/agents/components/agents-help-popover.tsx")
  const sidebar = read("src/renderer/features/sidebar/agents-sidebar.tsx")
  const justUpdated = read("src/renderer/lib/hooks/use-just-updated.ts")
  const updateBanner = read("src/renderer/components/update-banner.tsx")
  const envTypes = read("src/env.d.ts")

  assert.match(links, /VITE_OPENCODEX_COMMUNITY_URL/)
  assert.match(links, /VITE_OPENCODEX_CHANGELOG_URL/)
  assert.match(links, /VITE_OPENCODEX_AGENTS_CHANGELOG_URL/)
  assert.match(links, /VITE_OPENCODEX_CHANGELOG_FEED_URL/)

  assert.match(helpPopover, /OPENCODEX_CHANGELOG_FEED_URL/)
  assert.match(helpPopover, /OPENCODEX_COMMUNITY_URL/)
  assert.match(helpPopover, /buildOpenCodexAgentsChangelogUrl/)
  assert.match(sidebar, /OPENCODEX_COMMUNITY_URL/)
  assert.match(justUpdated, /buildOpenCodexChangelogUrl/)
  assert.match(updateBanner, /openChangelog\(\)/)
  assert.match(envTypes, /VITE_OPENCODEX_COMMUNITY_URL/)
  assert.match(envTypes, /VITE_OPENCODEX_CHANGELOG_URL/)

  assert.doesNotMatch(helpPopover, /1code\.dev/)
  assert.doesNotMatch(helpPopover, /discord\.gg\/8ektTZGnj4/)
  assert.doesNotMatch(sidebar, /discord\.gg\/8ektTZGnj4/)
  assert.doesNotMatch(justUpdated, /1code\.dev/)
  assert.doesNotMatch(updateBanner, /1code\.dev/)
})
