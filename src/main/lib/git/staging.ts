import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import {
	gitCheckoutFile,
	gitStageAll,
	gitStageFile,
	gitStageFiles,
	gitUnstageAll,
	gitUnstageFile,
	gitUnstageFiles,
	secureFs,
} from "./security";

export const createStagingRouter = () => {
	return router({
		stageFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStageFile(input.worktreePath, input.filePath);
				return { success: true };
			}),

		unstageFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitUnstageFile(input.worktreePath, input.filePath);
				return { success: true };
			}),

		discardChanges: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitCheckoutFile(input.worktreePath, input.filePath);
				return { success: true };
			}),

		stageAll: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStageAll(input.worktreePath);
				return { success: true };
			}),

		unstageAll: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitUnstageAll(input.worktreePath);
				return { success: true };
			}),

		stageFiles: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePaths: z.array(z.string()),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStageFiles(input.worktreePath, input.filePaths);
				return { success: true };
			}),

		unstageFiles: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePaths: z.array(z.string()),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitUnstageFiles(input.worktreePath, input.filePaths);
				return { success: true };
			}),

		deleteUntracked: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await secureFs.delete(input.worktreePath, input.filePath);
				return { success: true };
			}),
	});
};
