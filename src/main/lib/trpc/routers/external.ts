import { shell } from "electron";
import { spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { publicProcedure, router } from "../index";

function expandTilde(filePath: string): string {
	if (filePath.startsWith("~/") || filePath === "~") {
		return path.join(os.homedir(), filePath.slice(1));
	}
	return filePath;
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

	openFileInEditor: publicProcedure
		.input(
			z.object({
				path: z.string(),
				cwd: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const { path, cwd } = input;

			// Try common code editors in order of preference
			const editors = [
				{ cmd: "code", args: [path] }, // VS Code
				{ cmd: "cursor", args: [path] }, // Cursor
				{ cmd: "subl", args: [path] }, // Sublime Text
				{ cmd: "atom", args: [path] }, // Atom
				{ cmd: "open", args: ["-t", path] }, // macOS default text editor
			];

			for (const editor of editors) {
				try {
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
			await shell.openPath(path);
			return { success: true, editor: "default" };
		}),

	openExternal: publicProcedure
		.input(z.string())
		.mutation(async ({ input: url }) => {
			await shell.openExternal(url);
			return { success: true };
		}),
});
