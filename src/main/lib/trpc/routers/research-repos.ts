/**
 * Research Repos Router
 * Provides tRPC endpoints for accessing the research repository ecosystem
 */

import { z } from 'zod';
import { publicProcedure, router } from '../index';
import {
  RESEARCH_REPOS,
  REPO_RELATIONSHIPS,
  getResearchEcosystem,
  getReposByCategory,
  getReposByLanguage,
  getRelatedRepos,
  searchReposByTopic,
  type ResearchRepo,
} from '../../research-repos';
import {
  fetchRepoDetails,
  fetchRepoCommits,
  fetchRepoTree,
  analyzeRepo,
  analyzeEcosystem,
  getReposWithStatus,
  cloneRepo,
} from '../../research-repos/service';

export const researchReposRouter = router({
  /**
   * Get all configured research repositories
   */
  list: publicProcedure.query(() => {
    return RESEARCH_REPOS;
  }),

  /**
   * Get the full ecosystem configuration
   */
  ecosystem: publicProcedure.query(() => {
    return getResearchEcosystem();
  }),

  /**
   * Get repos by category
   */
  byCategory: publicProcedure
    .input(z.object({
      category: z.enum(['code', 'documentation', 'research', 'config']),
    }))
    .query(({ input }) => {
      return getReposByCategory(input.category);
    }),

  /**
   * Get repos by language
   */
  byLanguage: publicProcedure
    .input(z.object({
      language: z.string(),
    }))
    .query(({ input }) => {
      return getReposByLanguage(input.language);
    }),

  /**
   * Get related repos for a given repo
   */
  related: publicProcedure
    .input(z.object({
      repoName: z.string(),
    }))
    .query(({ input }) => {
      return getRelatedRepos(input.repoName);
    }),

  /**
   * Search repos by topic
   */
  searchByTopic: publicProcedure
    .input(z.object({
      topic: z.string(),
    }))
    .query(({ input }) => {
      return searchReposByTopic(input.topic);
    }),

  /**
   * Get repository relationships
   */
  relationships: publicProcedure.query(() => {
    return REPO_RELATIONSHIPS;
  }),

  /**
   * Fetch live repo details from GitHub
   */
  fetchDetails: publicProcedure
    .input(z.object({
      fullName: z.string(),
    }))
    .query(async ({ input }) => {
      return fetchRepoDetails(input.fullName);
    }),

  /**
   * Fetch recent commits for a repo
   */
  fetchCommits: publicProcedure
    .input(z.object({
      fullName: z.string(),
      limit: z.number().min(1).max(100).default(10),
    }))
    .query(async ({ input }) => {
      return fetchRepoCommits(input.fullName, input.limit);
    }),

  /**
   * Fetch repo file tree
   */
  fetchTree: publicProcedure
    .input(z.object({
      fullName: z.string(),
      branch: z.string().default('main'),
    }))
    .query(async ({ input }) => {
      return fetchRepoTree(input.fullName, input.branch);
    }),

  /**
   * Analyze a single repository
   */
  analyze: publicProcedure
    .input(z.object({
      repoName: z.string(),
    }))
    .query(async ({ input }) => {
      const repo = RESEARCH_REPOS.find(r => r.name === input.repoName);
      if (!repo) {
        throw new Error(`Repository ${input.repoName} not found in ecosystem`);
      }
      return analyzeRepo(repo);
    }),

  /**
   * Analyze the entire ecosystem
   */
  analyzeEcosystem: publicProcedure.query(async () => {
    return analyzeEcosystem();
  }),

  /**
   * Get all repos with live status
   */
  withStatus: publicProcedure.query(async () => {
    return getReposWithStatus();
  }),

  /**
   * Clone a repo to a local path
   */
  clone: publicProcedure
    .input(z.object({
      repoName: z.string(),
      targetPath: z.string(),
    }))
    .mutation(async ({ input }) => {
      const repo = RESEARCH_REPOS.find(r => r.name === input.repoName);
      if (!repo) {
        throw new Error(`Repository ${input.repoName} not found in ecosystem`);
      }
      const success = await cloneRepo(repo, input.targetPath);
      return { success, repo: repo.fullName, path: input.targetPath };
    }),
});
