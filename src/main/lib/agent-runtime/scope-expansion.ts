import { z } from "zod"

import {
  applyActiveGuardedScopeExpansion,
  type ApplyActiveGuardedScopeExpansionResult,
} from "../agent-guard/active-contracts"
import type { ValidateAgentScopeContractOptions } from "../agent-guard/contract"

export const desktopScopeExpansionResponseInputSchema = z.object({
  contractId: z.string(),
  toolUseId: z.string(),
  approved: z.boolean(),
  path: z.string().optional(),
  paths: z.array(z.string()).optional(),
  reason: z.string().optional(),
})

export type DesktopScopeExpansionResponseInput = z.infer<
  typeof desktopScopeExpansionResponseInputSchema
>

export type DesktopScopeExpansionResponseRuntimeInput =
  DesktopScopeExpansionResponseInput & {
    validateOptions?: Partial<ValidateAgentScopeContractOptions>
  }

export function respondDesktopScopeExpansion(
  input: DesktopScopeExpansionResponseRuntimeInput,
): Promise<ApplyActiveGuardedScopeExpansionResult> {
  return applyActiveGuardedScopeExpansion(input)
}
