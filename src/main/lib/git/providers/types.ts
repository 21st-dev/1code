import type { GitHubStatus, PRComment } from "../github/types";

/**
 * The provider-agnostic PR status shape. Aliased to GitHubStatus for v1 since
 * the GitHub provider defined the canonical shape and the renderer types
 * already import it everywhere. Renaming later is a mechanical follow-up.
 */
export type PullRequestStatus = GitHubStatus;

export type { PRComment };

export type SupportedProvider = "github" | "azure";
