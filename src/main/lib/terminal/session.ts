import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import * as pty from "node-pty"
import { buildTerminalEnv, FALLBACK_SHELL, getDefaultShell } from "./env"
import type { InternalCreateSessionParams, TerminalSession } from "./types"

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

function getShellArgs(shell: string): string[] {
	if (shell.includes("zsh")) {
		return ["-l"]
	}
	if (shell.includes("bash")) {
		return []
	}
	return []
}

/**
 * Validate and resolve cwd path (Windows compatibility)
 * Falls back to home directory if path doesn't exist
 */
function validateAndResolveCwd(cwd: string): string {
	if (!fs.existsSync(cwd)) {
		const homeDir = os.homedir()
		console.warn(`[Terminal] CWD does not exist: ${cwd}, using home directory: ${homeDir}`)
		return homeDir
	}

	try {
		const stat = fs.statSync(cwd)
		if (!stat.isDirectory()) {
			const homeDir = os.homedir()
			console.warn(`[Terminal] CWD is not a directory: ${cwd}, using home directory: ${homeDir}`)
			return homeDir
		}
	} catch {
		const homeDir = os.homedir()
		console.warn(`[Terminal] Error checking CWD: ${cwd}, using home directory: ${homeDir}`)
		return homeDir
	}

	try {
		return path.resolve(cwd)
	} catch {
		const homeDir = os.homedir()
		console.warn(`[Terminal] Error resolving CWD: ${cwd}, using home directory: ${homeDir}`)
		return homeDir
	}
}

/**
 * Resolve shell path for Windows
 * Tries to find shell in common Windows locations
 */
function resolveShellPath(shell: string): string {
	if (os.platform() !== "win32") return shell

	// If shell already has a path, use it as-is
	if (shell.includes("\\") || shell.includes("/")) return shell

	// Try common Windows shell locations
	const commonPaths = [
		process.env.COMSPEC || "",
		process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : "",
		process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\cmd.exe` : "",
	].filter(Boolean)

	for (const shellPath of commonPaths) {
		if (fs.existsSync(shellPath)) {
			return shellPath
		}
	}

	// Return as-is, let node-pty handle PATH resolution
	return shell
}

function spawnPty(params: {
	shell: string
	cols: number
	rows: number
	cwd: string
	env: Record<string, string>
}): pty.IPty {
	const { shell, cols, rows, cwd, env } = params
	const shellArgs = getShellArgs(shell)
	const resolvedCwd = validateAndResolveCwd(cwd)
	const resolvedShell = resolveShellPath(shell)

	try {
		return pty.spawn(resolvedShell, shellArgs, {
			name: "xterm-256color",
			cols,
			rows,
			cwd: resolvedCwd,
			env,
		})
	} catch (error) {
		console.error(`[Terminal] Failed to spawn PTY with ${resolvedShell}:`, error)
		// Try with fallback shell
		console.log(`[Terminal] Retrying with fallback shell: ${FALLBACK_SHELL}`)
		return pty.spawn(FALLBACK_SHELL, [], {
			name: "xterm-256color",
			cols,
			rows,
			cwd: resolvedCwd,
			env,
		})
	}
}

export async function createSession(
	params: InternalCreateSessionParams,
	onData: (paneId: string, data: string) => void,
): Promise<TerminalSession> {
	const {
		paneId,
		tabId,
		workspaceId,
		workspaceName,
		workspacePath,
		rootPath,
		cwd,
		cols,
		rows,
		useFallbackShell = false,
	} = params

	const shell = useFallbackShell ? FALLBACK_SHELL : getDefaultShell()
	if (!cwd) {
		console.warn(
			`[Terminal] No cwd provided for paneId=${paneId} — falling back to ${os.homedir()}. This usually means the workspace path wasn't ready when the terminal was created.`,
		)
	}
	const workingDir = validateAndResolveCwd(cwd || os.homedir())
	const terminalCols = cols || DEFAULT_COLS
	const terminalRows = rows || DEFAULT_ROWS

	const env = buildTerminalEnv({
		shell,
		paneId,
		tabId,
		workspaceId,
		workspaceName,
		workspacePath,
		rootPath,
	})

	const ptyProcess = spawnPty({
		shell,
		cols: terminalCols,
		rows: terminalRows,
		cwd: workingDir,
		env,
	})

	const session: TerminalSession = {
		pty: ptyProcess,
		paneId,
		workspaceId: workspaceId || "",
		scopeKey: params.scopeKey || workspaceId || "",
		cwd: workingDir,
		cols: terminalCols,
		rows: terminalRows,
		lastActive: Date.now(),
		isAlive: true,
		shell,
		startTime: Date.now(),
		usedFallback: useFallbackShell,
	}

	ptyProcess.onData((data) => {
		onData(paneId, data)
	})

	return session
}

/**
 * Set up initial commands to run after shell prompt is ready.
 * Commands are only sent for new sessions (not reattachments).
 */
export function setupInitialCommands(
	session: TerminalSession,
	initialCommands: string[] | undefined,
): void {
	if (!initialCommands || initialCommands.length === 0) {
		return
	}

	const initialCommandString = `${initialCommands.join(" && ")}\n`

	const dataHandler = session.pty.onData(() => {
		dataHandler.dispose()

		setTimeout(() => {
			if (session.isAlive) {
				session.pty.write(initialCommandString)
			}
		}, 100)
	})
}
