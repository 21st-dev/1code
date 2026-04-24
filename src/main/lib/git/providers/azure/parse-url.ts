/**
 * Azure DevOps remote URL parsing helpers.
 *
 * Cloud only (v1): dev.azure.com + legacy visualstudio.com hosts.
 * On-prem Azure DevOps Server is intentionally out of scope.
 */

export interface AzureRemote {
	organization: string;
	project: string;
	repository: string;
	/** Base org URL without trailing slash, e.g. "https://dev.azure.com/myorg". */
	orgUrl: string;
	/** Canonical web URL of the repo, e.g. "https://dev.azure.com/myorg/MyProject/_git/myrepo". */
	repoWebUrl: string;
}

/**
 * Parse any supported Azure DevOps remote URL into structured org/project/repo parts.
 * Returns null if the URL doesn't match an Azure pattern.
 */
export function parseAzureRemoteUrl(url: string): AzureRemote | null {
	let normalized = url.trim();
	if (normalized.endsWith(".git")) {
		normalized = normalized.slice(0, -4);
	}

	// HTTPS: https://[org@]dev.azure.com/{org}/{project}/_git/{repo}
	const azureHttps = normalized.match(
		/https?:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)/,
	);
	if (azureHttps) {
		const [, org, project, repo] = azureHttps;
		return buildRemote(org, project, repo);
	}

	// Legacy HTTPS: https://{org}.visualstudio.com/[DefaultCollection/]{project}/_git/{repo}
	const legacyHttps = normalized.match(
		/https?:\/\/([^.]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+)/,
	);
	if (legacyHttps) {
		const [, org, project, repo] = legacyHttps;
		return buildRemote(org, project, repo);
	}

	// SSH: git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
	const azureSsh = normalized.match(
		/git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/(.+)/,
	);
	if (azureSsh) {
		const [, org, project, repo] = azureSsh;
		return buildRemote(org, project, repo);
	}

	// Legacy SSH: {anything}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}
	const legacyVsSsh = normalized.match(
		/[^@]+@vs-ssh\.visualstudio\.com:v3\/([^/]+)\/([^/]+)\/(.+)/,
	);
	if (legacyVsSsh) {
		const [, org, project, repo] = legacyVsSsh;
		return buildRemote(org, project, repo);
	}

	return null;
}

function buildRemote(
	org: string,
	project: string,
	repo: string,
): AzureRemote {
	const orgUrl = `https://dev.azure.com/${org}`;
	return {
		organization: org,
		project,
		repository: repo,
		orgUrl,
		repoWebUrl: `${orgUrl}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repo)}`,
	};
}

/**
 * Build the web URL for an Azure DevOps "Create PR" page, preselecting source + target.
 */
export function buildAzureCreatePRWebUrl(args: {
	remote: AzureRemote;
	branch: string;
	baseBranch: string;
}): string {
	const { remote, branch, baseBranch } = args;
	return (
		`${remote.repoWebUrl}/pullrequestcreate` +
		`?sourceRef=${encodeURIComponent(branch)}` +
		`&targetRef=${encodeURIComponent(baseBranch)}`
	);
}
