import { router } from "../index"
import { projectsRouter } from "./projects"
import { chatsRouter } from "./chats"
import { claudeRouter } from "./claude"
import { claudeCodeRouter } from "./claude-code"
import { claudeSettingsRouter } from "./claude-settings"
import { ollamaRouter } from "./ollama"
import { terminalRouter } from "./terminal"
import { externalRouter } from "./external"
import { filesRouter } from "./files"
import { debugRouter } from "./debug"
import { skillsRouter } from "./skills"
import { agentsRouter } from "./agents"
import { worktreeConfigRouter } from "./worktree-config"
import { commandsRouter } from "./commands"
import { fileCrudRouter } from "./file-crud"
import { modelProfilesRouter } from "./model-profiles"
import { feedbackRouter } from "./feedback"
import { createGitRouter } from "../../git"
import { BrowserWindow } from "electron"

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
    ollama: ollamaRouter,
    terminal: terminalRouter,
    external: externalRouter,
    files: filesRouter,
    debug: debugRouter,
    skills: skillsRouter,
    agents: agentsRouter,
    worktreeConfig: worktreeConfigRouter,
    commands: commandsRouter,
    // File CRUD operations - keep "workspaceFiles" name for backward compatibility
    workspaceFiles: fileCrudRouter,
    // Model profiles for custom model configurations
    modelProfiles: modelProfilesRouter,
    // Git operations - named "changes" to match Superset API
    changes: createGitRouter(),
    // Feedback system
    feedback: feedbackRouter,
  })
}

/**
 * Export the router type for client usage
 */
export type AppRouter = ReturnType<typeof createAppRouter>
