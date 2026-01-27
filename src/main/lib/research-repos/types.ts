import { z } from 'zod';

/**
 * Zod schemas for GitHub API responses
 */
export const GitHubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
  clone_url: z.string(),
  language: z.string().nullable(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  default_branch: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string(),
  topics: z.array(z.string()).optional(),
});

export type GitHubRepo = z.infer<typeof GitHubRepoSchema>;

export const GitHubCommitSchema = z.object({
  sha: z.string(),
  commit: z.object({
    message: z.string(),
    author: z.object({
      name: z.string(),
      email: z.string(),
      date: z.string(),
    }),
  }),
  html_url: z.string(),
});

export type GitHubCommit = z.infer<typeof GitHubCommitSchema>;

export const GitHubTreeItemSchema = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.enum(['blob', 'tree']),
  sha: z.string(),
  size: z.number().optional(),
});

export const GitHubTreeSchema = z.object({
  sha: z.string(),
  tree: z.array(GitHubTreeItemSchema),
  truncated: z.boolean(),
});

export type GitHubTree = z.infer<typeof GitHubTreeSchema>;
export type GitHubTreeItem = z.infer<typeof GitHubTreeItemSchema>;

/**
 * Analysis result types
 */
export interface RepoAnalysis {
  repo: string;
  lastCommit: GitHubCommit | null;
  fileCount: number;
  directories: string[];
  languages: Record<string, number>;
  recentActivity: {
    commits: number;
    lastPush: string;
  };
}

export interface EcosystemAnalysis {
  totalRepos: number;
  totalCommits: number;
  primaryLanguages: string[];
  categories: Record<string, number>;
  repoAnalyses: RepoAnalysis[];
}
