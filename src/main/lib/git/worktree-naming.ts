import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	adjectives,
	uniqueNamesGenerator,
} from "unique-names-generator";
import { landscapes } from "./dictionaries/landscapes";

const MAX_RETRIES = 10;

function generateLandscapeName(): string {
	return uniqueNamesGenerator({
		dictionaries: [adjectives, landscapes],
		separator: "-",
		length: 2,
		style: "lowerCase",
	});
}

/**
 * Sanitize a project name for use as a filesystem directory name.
 * Lowercases, replaces spaces/underscores with hyphens, strips special characters.
 * Truncates to 50 characters to stay within filesystem path length limits.
 *
 * Slug collisions (e.g., "My Project" and "my_project" both becoming "my-project")
 * are safe because resolveProjectPathFromWorktree() looks up the full worktree path
 * via the chats table, not just the project folder name.
 */
export function sanitizeProjectName(name: string): string {
	const sanitized = name
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9\-.]/g, "")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 50);

	return sanitized || "project";
}

/**
 * Generate a unique, human-readable folder name for a worktree.
 * Uses adjective-landscape pattern (e.g., "golden-meadow", "quiet-ridge").
 * Checks the parent directory for existing folders to avoid collisions.
 * Falls back to appending a numeric suffix if random generation keeps colliding.
 *
 * Note: There is a theoretical TOCTOU race between existsSync and the actual
 * git worktree add. In practice this is negligible (180k combinations, single
 * local user). If it occurs, git worktree add fails atomically and the error
 * is caught by createWorktreeForChat().
 */
export function generateWorktreeFolderName(parentDir: string): string {
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		const name = generateLandscapeName();
		if (!existsSync(join(parentDir, name))) {
			return name;
		}
	}

	// Fallback: generate a base name and append numeric suffix
	const baseName = generateLandscapeName();

	for (let suffix = 2; suffix <= 999; suffix++) {
		const name = `${baseName}-${suffix}`;
		if (!existsSync(join(parentDir, name))) {
			return name;
		}
	}

	// Absolute fallback: append timestamp
	return `${baseName}-${Date.now().toString(36)}`;
}
