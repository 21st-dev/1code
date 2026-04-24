import { clipboard, shell } from "electron";
import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { publicProcedure, router } from "../index";
import {
	APP_META,
	externalAppSchema,
	type ExternalApp,
} from "../../../../shared/external-apps";
import { execWithShellEnv } from "../../git/shell-env";

const execFileAsync = promisify(execFile);

function expandTilde(filePath: string): string {
	if (filePath.startsWith("~/") || filePath === "~") {
		return path.join(os.homedir(), filePath.slice(1));
	}
	return filePath;
}

// CLI name per editor when one exists. Preferred over `open -a` because the
// `.app` bundle may be missing on systems installed via brew / standalone CLI.
const APP_CLI: Partial<Record<ExternalApp, string>> = {
	vscode: "code",
	"vscode-insiders": "code-insiders",
	cursor: "cursor",
	windsurf: "windsurf",
	zed: "zed",
	sublime: "subl",
	trae: "trae",
	fleet: "fleet",
	intellij: "idea",
	webstorm: "webstorm",
	pycharm: "pycharm",
	phpstorm: "phpstorm",
	rubymine: "rubymine",
	goland: "goland",
	clion: "clion",
	rider: "rider",
	datagrip: "datagrip",
	appcode: "appcode",
	rustrover: "rustrover",
};

function spawnDetached(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const child = spawn(command, args, {
			detached: true,
			stdio: "ignore",
		});
		child.on("error", (err) => {
			if (settled) return;
			settled = true;
			reject(err);
		});
		child.on("spawn", () => {
			if (settled) return;
			settled = true;
			child.unref();
			resolve();
		});
	});
}

async function hasCommand(command: string): Promise<boolean> {
	try {
		// execWithShellEnv lazily fixes process.env.PATH on ENOENT so homebrew/user-
		// local CLIs work even when launched from Finder/Dock (minimal GUI PATH).
		await execWithShellEnv("which", [command]);
		return true;
	} catch {
		return false;
	}
}

async function openPathInApp(
	app: ExternalApp,
	targetPath: string,
): Promise<void> {
	const expandedPath = expandTilde(targetPath);

	if (app === "finder") {
		shell.showItemInFolder(expandedPath);
		return;
	}

	const cliCommand = APP_CLI[app];
	if (cliCommand && (await hasCommand(cliCommand))) {
		try {
			await spawnDetached(cliCommand, [expandedPath]);
			return;
		} catch (err) {
			console.warn(
				`[external] ${cliCommand} failed, falling back to 'open -a':`,
				err,
			);
		}
	}

	const meta = APP_META[app];
	// `open -a` exits non-zero when the .app bundle isn't found — awaiting
	// execFileAsync surfaces that as a thrown error instead of silent failure.
	await execFileAsync("open", ["-a", meta.macAppName, expandedPath]);
}

/**
 * External router for shell operations (open in finder, open in editor, etc.)
 */
export const externalRouter = router({
	openInFinder: publicProcedure
		.input(z.string())
		.mutation(async ({ input: inputPath }) => {
			const expandedPath = expandTilde(inputPath);
			shell.showItemInFolder(expandedPath);
			return { success: true };
		}),

	openInApp: publicProcedure
		.input(
			z.object({
				path: z.string(),
				app: externalAppSchema,
			}),
		)
		.mutation(async ({ input }) => {
			await openPathInApp(input.app, input.path);
			return { success: true };
		}),

	copyPath: publicProcedure
		.input(z.string())
		.mutation(({ input: inputPath }) => {
			clipboard.writeText(inputPath);
			return { success: true };
		}),

	openFileInEditor: publicProcedure
		.input(
			z.object({
				path: z.string(),
				cwd: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const { cwd } = input;
			const filePath = input.path.startsWith("~")
				? input.path.replace("~", os.homedir())
				: input.path;

			// Try common code editors in order of preference
			const editors = [
				{ cmd: "cursor", args: [filePath] }, // Cursor
				{ cmd: "code", args: [filePath] }, // VS Code
				{ cmd: "subl", args: [filePath] }, // Sublime Text
				{ cmd: "atom", args: [filePath] }, // Atom
				{ cmd: "open", args: ["-t", filePath] }, // macOS default text editor
			];

			for (const editor of editors) {
				try {
					// Check if the command exists first
					execFileSync("which", [editor.cmd], { stdio: "ignore" });
					const child = spawn(editor.cmd, editor.args, {
						cwd: cwd || undefined,
						detached: true,
						stdio: "ignore",
					});
					child.unref();
					return { success: true, editor: editor.cmd };
				} catch {
					// Try next editor
					continue;
				}
			}

			// Fallback: use shell.openPath which opens with default app
			await shell.openPath(filePath);
			return { success: true, editor: "default" };
		}),

	openExternal: publicProcedure
		.input(z.string())
		.mutation(async ({ input: url }) => {
			await shell.openExternal(url);
			return { success: true };
		}),
});
