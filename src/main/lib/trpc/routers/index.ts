import type { BrowserWindow } from "electron"
import { createGitRouter } from "../../git"
import { router } from "../index"
import { agentBuilderRouter } from "./agent-builder"
import { agentJobsRouter } from "./agent-jobs"
import { agentRuntimeRouter } from "./agent-runtime"
import { agentSchedulesRouter } from "./agent-schedules"
import { agentWorkbenchRouter } from "./agent-workbench"
import { agentsRouter } from "./agents"
import { anthropicAccountsRouter } from "./anthropic-accounts"
import { appAgentsRouter } from "./app-agents"
import { appUpdatesRouter } from "./app-updates"
import { chatAttachmentsRouter } from "./chat-attachments"
import { chatsRouter } from "./chats"
import { claudeRouter } from "./claude"
import { claudeCodeRouter } from "./claude-code"
import { claudeProviderConfigRouter } from "./claude-provider-config"
import { claudeSettingsRouter } from "./claude-settings"
import { codexRouter } from "./codex"
import { commandsRouter } from "./commands"
import { debugRouter } from "./debug"
import { externalRouter } from "./external"
import { filesRouter } from "./files"
import { githubWorkflowRouter } from "./github-workflow"
import { localApiProviderConfigRouter } from "./local-api-provider-config"
import { mcpRegistryRouter } from "./mcp-registry"
import { ollamaRouter } from "./ollama"
import { pluginsRouter } from "./plugins"
import { projectsRouter } from "./projects"
import { providerProfilesRouter } from "./provider-profiles"
import { skillsRouter } from "./skills"
import { terminalRouter } from "./terminal"
import { voiceRouter } from "./voice"
import { worktreeConfigRouter } from "./worktree-config"

/**
 * Create the main app router
 * Uses getter pattern to avoid stale window references
 */
export function createAppRouter(getWindow: () => BrowserWindow | null) {
  return router({
    projects: projectsRouter,
    chats: chatsRouter,
    claude: claudeRouter,
    claudeCode: claudeCodeRouter,
    claudeSettings: claudeSettingsRouter,
    claudeProviderConfig: claudeProviderConfigRouter,
    localApiProviderConfig: localApiProviderConfigRouter,
    providerProfiles: providerProfilesRouter,
    anthropicAccounts: anthropicAccountsRouter,
    ollama: ollamaRouter,
    codex: codexRouter,
    terminal: terminalRouter,
    external: externalRouter,
    files: filesRouter,
    debug: debugRouter,
    skills: skillsRouter,
    agents: agentsRouter,
    appAgents: appAgentsRouter,
    worktreeConfig: worktreeConfigRouter,
    commands: commandsRouter,
    voice: voiceRouter,
    plugins: pluginsRouter,
    appUpdates: appUpdatesRouter,
    githubWorkflow: githubWorkflowRouter,
    agentBuilder: agentBuilderRouter,
    agentWorkbench: agentWorkbenchRouter,
    chatAttachments: chatAttachmentsRouter,
    agentRuntime: agentRuntimeRouter,
    agentJobs: agentJobsRouter,
    agentSchedules: agentSchedulesRouter,
    mcpRegistry: mcpRegistryRouter,
    // Git operations - named "changes" to match Superset API
    changes: createGitRouter(),
  })
}

/**
 * Export the router type for client usage
 */
export type AppRouter = ReturnType<typeof createAppRouter>
