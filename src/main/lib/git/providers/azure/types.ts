import { z } from "zod";

/**
 * Narrow zod schemas for az-CLI JSON output. Azure returns a lot more fields than
 * we care about — these schemas only validate what we read, everything else is
 * permissively ignored.
 */

export const AzureReviewerSchema = z.object({
	vote: z.number(),
	isRequired: z.boolean().optional(),
	hasDeclined: z.boolean().optional(),
	displayName: z.string().optional(),
});

export const AzurePRSchema = z.object({
	pullRequestId: z.number(),
	title: z.string(),
	status: z.enum(["active", "completed", "abandoned"]),
	isDraft: z.boolean().optional(),
	mergeStatus: z
		.enum([
			"succeeded",
			"conflicts",
			"queued",
			"rejectedByPolicy",
			"notSet",
			"failure",
		])
		.optional(),
	closedDate: z.string().nullable().optional(),
	reviewers: z.array(AzureReviewerSchema).optional(),
	url: z.string().optional(),
});

/** `az repos pr policy list` entry — the interesting bits for check rendering. */
export const AzurePolicyEvalSchema = z.object({
	status: z.string(), // "approved" | "queued" | "running" | "rejected" | "notApplicable" | "broken"
	configuration: z
		.object({
			type: z
				.object({
					displayName: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
});

export type AzurePR = z.infer<typeof AzurePRSchema>;
export type AzurePolicyEval = z.infer<typeof AzurePolicyEvalSchema>;
