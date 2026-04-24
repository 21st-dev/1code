import { execWithShellEnv } from "../../shell-env";

export type AzureDetection =
	| { status: "ok" }
	| { status: "missing_cli" }
	| { status: "missing_extension" }
	| { status: "not_logged_in" }
	| { status: "error"; message: string };

// Cached for 60s to avoid repeated shell spawns on every PR poll.
let cached: { value: AzureDetection; timestamp: number } | null = null;
const TTL_MS = 60_000;

/**
 * Silent, cached detection of az CLI + azure-devops extension + `az account` auth.
 * Never prompts the user, never auto-installs. Safe to call from polling queries.
 */
export async function detectAzureCli(): Promise<AzureDetection> {
	if (cached && Date.now() - cached.timestamp < TTL_MS) {
		return cached.value;
	}
	const value = await runDetection();
	cached = { value, timestamp: Date.now() };
	return value;
}

/** Drop the cached detection result (e.g. after the user installs `az`). */
export function invalidateAzureDetection(): void {
	cached = null;
}

async function runDetection(): Promise<AzureDetection> {
	// 1. `az` on PATH?
	try {
		await execWithShellEnv("which", ["az"]);
	} catch {
		return { status: "missing_cli" };
	}

	// 2. azure-devops extension installed?
	try {
		const { stdout } = await execWithShellEnv("az", [
			"extension",
			"list",
			"--query",
			"[?name=='azure-devops'].name",
			"-o",
			"tsv",
		]);
		if (!stdout.trim()) {
			return { status: "missing_extension" };
		}
	} catch (err) {
		return {
			status: "error",
			message: err instanceof Error ? err.message : String(err),
		};
	}

	// 3. logged in? `az account show` errors when there's no subscription context.
	try {
		await execWithShellEnv("az", ["account", "show", "--output", "json"]);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (/az login/i.test(msg)) {
			return { status: "not_logged_in" };
		}
		return { status: "not_logged_in" };
	}

	return { status: "ok" };
}

/** Human-readable toast text for a detection failure. Used by mutations. */
export function detectionToToastMessage(d: AzureDetection): string {
	switch (d.status) {
		case "ok":
			return "";
		case "missing_cli":
			return "Azure CLI not found. Install from https://aka.ms/install-az and retry.";
		case "missing_extension":
			return "Azure DevOps extension missing. Run: az extension add --name azure-devops";
		case "not_logged_in":
			return "Not logged in to Azure. Run az login and retry.";
		case "error":
			return d.message;
	}
}
