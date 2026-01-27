/**
 * Research Repository Service
 * Provides live access to repository data via GitHub CLI
 */

import { execWithShellEnv } from '../git/shell-env';
import { RESEARCH_REPOS, type ResearchRepo } from './index';
import {
  GitHubRepoSchema,
  GitHubCommitSchema,
  GitHubTreeSchema,
  type GitHubRepo,
  type GitHubCommit,
  type GitHubTree,
  type RepoAnalysis,
  type EcosystemAnalysis,
} from './types';

// Cache for repo data (5 minute TTL)
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data as T;
  }
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch repository details from GitHub
 */
export async function fetchRepoDetails(fullName: string): Promise<GitHubRepo | null> {
  const cacheKey = `repo:${fullName}`;
  const cached = getCached<GitHubRepo>(cacheKey);
  if (cached) return cached;

  try {
    const { stdout } = await execWithShellEnv('gh', [
      'api',
      `repos/${fullName}`,
      '--jq', '.',
    ]);

    const raw = JSON.parse(stdout);
    const result = GitHubRepoSchema.safeParse(raw);

    if (!result.success) {
      console.error(`[ResearchRepos] Schema validation failed for ${fullName}:`, result.error);
      return null;
    }

    setCache(cacheKey, result.data);
    return result.data;
  } catch (error) {
    console.error(`[ResearchRepos] Failed to fetch repo ${fullName}:`, error);
    return null;
  }
}

/**
 * Fetch recent commits for a repository
 */
export async function fetchRepoCommits(fullName: string, limit = 10): Promise<GitHubCommit[]> {
  const cacheKey = `commits:${fullName}:${limit}`;
  const cached = getCached<GitHubCommit[]>(cacheKey);
  if (cached) return cached;

  try {
    const { stdout } = await execWithShellEnv('gh', [
      'api',
      `repos/${fullName}/commits`,
      '--jq', `.[0:${limit}]`,
    ]);

    const raw = JSON.parse(stdout);
    const commits: GitHubCommit[] = [];

    for (const item of raw) {
      const result = GitHubCommitSchema.safeParse(item);
      if (result.success) {
        commits.push(result.data);
      }
    }

    setCache(cacheKey, commits);
    return commits;
  } catch (error) {
    console.error(`[ResearchRepos] Failed to fetch commits for ${fullName}:`, error);
    return [];
  }
}

/**
 * Fetch repository file tree
 */
export async function fetchRepoTree(fullName: string, branch = 'main'): Promise<GitHubTree | null> {
  const cacheKey = `tree:${fullName}:${branch}`;
  const cached = getCached<GitHubTree>(cacheKey);
  if (cached) return cached;

  try {
    const { stdout } = await execWithShellEnv('gh', [
      'api',
      `repos/${fullName}/git/trees/${branch}`,
      '-q', '.',
    ]);

    const raw = JSON.parse(stdout);
    const result = GitHubTreeSchema.safeParse(raw);

    if (!result.success) {
      console.error(`[ResearchRepos] Tree schema validation failed for ${fullName}:`, result.error);
      return null;
    }

    setCache(cacheKey, result.data);
    return result.data;
  } catch (error) {
    console.error(`[ResearchRepos] Failed to fetch tree for ${fullName}:`, error);
    return null;
  }
}

/**
 * Analyze a single repository
 */
export async function analyzeRepo(repo: ResearchRepo): Promise<RepoAnalysis> {
  const [details, commits, tree] = await Promise.all([
    fetchRepoDetails(repo.fullName),
    fetchRepoCommits(repo.fullName, 5),
    fetchRepoTree(repo.fullName),
  ]);

  const directories = tree?.tree
    .filter(item => item.type === 'tree')
    .map(item => item.path) ?? [];

  const files = tree?.tree.filter(item => item.type === 'blob') ?? [];

  // Count file extensions
  const languages: Record<string, number> = {};
  for (const file of files) {
    const ext = file.path.split('.').pop()?.toLowerCase() ?? 'unknown';
    languages[ext] = (languages[ext] ?? 0) + 1;
  }

  return {
    repo: repo.name,
    lastCommit: commits[0] ?? null,
    fileCount: files.length,
    directories,
    languages,
    recentActivity: {
      commits: commits.length,
      lastPush: details?.pushed_at ?? 'unknown',
    },
  };
}

/**
 * Analyze the entire research ecosystem
 */
export async function analyzeEcosystem(): Promise<EcosystemAnalysis> {
  const analyses = await Promise.all(
    RESEARCH_REPOS.map(repo => analyzeRepo(repo))
  );

  const totalCommits = analyses.reduce((sum, a) => sum + a.recentActivity.commits, 0);

  const languageCounts: Record<string, number> = {};
  for (const analysis of analyses) {
    for (const [lang, count] of Object.entries(analysis.languages)) {
      languageCounts[lang] = (languageCounts[lang] ?? 0) + count;
    }
  }

  const primaryLanguages = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang]) => lang);

  const categories: Record<string, number> = {};
  for (const repo of RESEARCH_REPOS) {
    categories[repo.category] = (categories[repo.category] ?? 0) + 1;
  }

  return {
    totalRepos: RESEARCH_REPOS.length,
    totalCommits,
    primaryLanguages,
    categories,
    repoAnalyses: analyses,
  };
}

/**
 * Clone a research repo to a local path
 */
export async function cloneRepo(repo: ResearchRepo, targetPath: string): Promise<boolean> {
  try {
    await execWithShellEnv('gh', [
      'repo',
      'clone',
      repo.fullName,
      targetPath,
    ]);
    return true;
  } catch (error) {
    console.error(`[ResearchRepos] Failed to clone ${repo.fullName}:`, error);
    return false;
  }
}

/**
 * Get all research repos with live status
 */
export async function getReposWithStatus(): Promise<(ResearchRepo & { live?: GitHubRepo })[]> {
  const results = await Promise.all(
    RESEARCH_REPOS.map(async repo => {
      const live = await fetchRepoDetails(repo.fullName);
      return { ...repo, live: live ?? undefined };
    })
  );
  return results;
}
