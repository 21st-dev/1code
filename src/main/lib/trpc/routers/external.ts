import { execFileSync, spawn } from "node:child_process"
import { writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { clipboard, dialog, shell } from "electron"
import { z } from "zod"
import {
  APP_META,
  type ExternalApp,
  externalAppSchema,
} from "../../../../shared/external-apps"
import { openExternalUrl } from "../../local-only"
import { publicProcedure, router } from "../index"

const APP_COMMANDS: Partial<Record<ExternalApp, string[]>> = {
  cursor: ["cursor"],
  vscode: ["code"],
  "vscode-insiders": ["code-insiders"],
  zed: ["zed"],
  windsurf: ["windsurf"],
  sublime: ["subl", "sublime_text"],
  trae: ["trae"],
  "github-desktop": ["github"],
  intellij: ["idea", "idea64"],
  webstorm: ["webstorm", "webstorm64"],
  pycharm: ["pycharm", "pycharm64"],
  phpstorm: ["phpstorm", "phpstorm64"],
  rubymine: ["rubymine", "rubymine64"],
  goland: ["goland", "goland64"],
  clion: ["clion", "clion64"],
  rider: ["rider", "rider64"],
  datagrip: ["datagrip", "datagrip64"],
  fleet: ["fleet"],
  rustrover: ["rustrover", "rustrover64"],
}

function expandTilde(filePath: string): string {
  if (filePath.startsWith("~/") || filePath === "~") {
    return path.join(os.homedir(), filePath.slice(1))
  }
  return filePath
}

function sanitizeDefaultFilename(filename: string): string {
  const sanitized = filename
    .replace(new RegExp('[<>:"/\\\\|?*\\x00-\\x1F]', "g"), "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120)
  return sanitized || "assistant-output.md"
}

function spawnAsync(
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: process.platform === "win32",
    })
    child.unref()
    child.on("error", reject)
    // Resolve immediately — we just need to launch the app
    resolve()
  })
}

function commandExists(command: string): boolean {
  try {
    const lookupCommand = process.platform === "win32" ? "where" : "which"
    execFileSync(lookupCommand, [command], {
      stdio: "ignore",
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

async function spawnFirstAvailableCommand(
  commands: string[],
  args: string[],
  options?: { cwd?: string },
): Promise<string | null> {
  for (const command of commands) {
    if (!commandExists(command)) continue
    await spawnAsync(command, args, options)
    return command
  }

  return null
}

async function openPathInApp(
  app: ExternalApp,
  targetPath: string,
): Promise<void> {
  const expandedPath = expandTilde(targetPath)

  if (app === "finder") {
    shell.showItemInFolder(expandedPath)
    return
  }

  const commands = APP_COMMANDS[app]
  if (commands) {
    const launched = await spawnFirstAvailableCommand(commands, [expandedPath])
    if (launched) return
  }

  if (process.platform !== "darwin") {
    await shell.openPath(expandedPath)
    return
  }

  const meta = APP_META[app]
  await spawnAsync("open", ["-a", meta.macAppName, expandedPath])
}

/**
 * External router for shell operations (open in finder, open in editor, etc.)
 */
export const externalRouter = router({
  openInFinder: publicProcedure
    .input(z.string())
    .mutation(async ({ input: inputPath }) => {
      const expandedPath = expandTilde(inputPath)
      shell.showItemInFolder(expandedPath)
      return { success: true }
    }),

  openInApp: publicProcedure
    .input(
      z.object({
        path: z.string(),
        app: externalAppSchema,
      }),
    )
    .mutation(async ({ input }) => {
      await openPathInApp(input.app, input.path)
      return { success: true }
    }),

  copyPath: publicProcedure
    .input(z.string())
    .mutation(({ input: inputPath }) => {
      clipboard.writeText(inputPath)
      return { success: true }
    }),

  saveTextFile: publicProcedure
    .input(
      z.object({
        content: z.string().max(2_000_000),
        filename: z.string().max(160).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await dialog.showSaveDialog({
        defaultPath: sanitizeDefaultFilename(
          input.filename || "assistant-output.md",
        ),
        filters: [
          { name: "Markdown", extensions: ["md"] },
          { name: "Text", extensions: ["txt"] },
          { name: "All Files", extensions: ["*"] },
        ],
      })

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true as const }
      }

      await writeFile(result.filePath, input.content, "utf8")
      return {
        success: true,
        canceled: false as const,
        filePath: result.filePath,
      }
    }),

  openFileInEditor: publicProcedure
    .input(
      z.object({
        path: z.string(),
        cwd: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { cwd } = input
      const filePath = input.path.startsWith("~")
        ? input.path.replace("~", os.homedir())
        : input.path

      // Try common code editors in order of preference
      const editors = [
        { cmd: "cursor", args: [filePath] }, // Cursor
        { cmd: "code", args: [filePath] }, // VS Code
        { cmd: "code-insiders", args: [filePath] }, // VS Code Insiders
        { cmd: "windsurf", args: [filePath] }, // Windsurf
        { cmd: "zed", args: [filePath] }, // Zed
        { cmd: "subl", args: [filePath] }, // Sublime Text
        { cmd: "atom", args: [filePath] }, // Atom
        ...(process.platform === "darwin"
          ? [{ cmd: "open", args: ["-t", filePath] }]
          : []), // macOS default text editor
      ]

      for (const editor of editors) {
        try {
          // Check if the command exists first
          if (!commandExists(editor.cmd)) continue
          await spawnAsync(editor.cmd, editor.args, { cwd })
          return { success: true, editor: editor.cmd }
        } catch {
          // Try next editor
        }
      }

      // Fallback: use shell.openPath which opens with default app
      await shell.openPath(filePath)
      return { success: true, editor: "default" }
    }),

  openExternal: publicProcedure
    .input(z.string())
    .mutation(async ({ input: url }) => {
      await openExternalUrl("open external URL", url)
      return { success: true }
    }),
})
