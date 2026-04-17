import { router } from "../index"
import { projectsRouter } from "./projects"
import { chatsRouter } from "./chats"
import { claudeRouter } from "./claude"
import { claudeSettingsRouter } from "./claude-settings"
import { ollamaRouter } from "./ollama"
import { codexRouter } from "./codex"
import { terminalRouter } from "./terminal"
import { externalRouter } from "./external"
import { filesRouter } from "./files"
import { debugRouter } from "./debug"
import { skillsRouter } from "./skills"
import { agentsRouter } from "./agents"
import { worktreeConfigRouter } from "./worktree-config"
import { sandboxImportRouter } from "./sandbox-import"
import { commandsRouter } from "./commands"
import { voiceRouter } from "./voice"
import { pluginsRouter } from "./plugins"
import { createGitRouter } from "../../git"
import { BrowserWindow } from "electron"
import { openCodexRouter } from "./opencodex"

/**
 * Create the main app router
 * Uses getter pattern to avoid stale window references
 */
export function createAppRouter(getWindow: () => BrowserWindow | null) {
  return router({
    projects: projectsRouter,
    chats: chatsRouter,
    claude: claudeRouter,
    claudeSettings: claudeSettingsRouter,
    ollama: ollamaRouter,
    codex: codexRouter,
    terminal: terminalRouter,
    external: externalRouter,
    files: filesRouter,
    debug: debugRouter,
    skills: skillsRouter,
    agents: agentsRouter,
    worktreeConfig: worktreeConfigRouter,
    sandboxImport: sandboxImportRouter,
    commands: commandsRouter,
    voice: voiceRouter,
    plugins: pluginsRouter,
    opencodex: openCodexRouter,
    // Git operations - named "changes" to match Superset API
    changes: createGitRouter(),
  })
}

/**
 * Export the router type for client usage
 */
export type AppRouter = ReturnType<typeof createAppRouter>
