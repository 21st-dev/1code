import path from "node:path"
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk"
import type {
  AgentGuardDecision,
  AgentGuardEvent,
  AgentScopePath,
} from "../../../shared/agent-scope-contracts"
import {
  containsShellControl,
  isHighRiskCommand,
  isSensitiveScopePath,
  normalizeContractRelativePath,
  normalizeToolPathInsideCwd,
  type ValidatedAgentScopeContract,
} from "./contract"

export type ClaudeToolCategory =
  | "read"
  | "write"
  | "shell"
  | "approval"
  | "unknown"

export type DecideClaudeToolUseInput = {
  contract: ValidatedAgentScopeContract
  toolName: string
  toolInput: Record<string, unknown>
  toolUseId: string
}

const READ_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "LS",
  "TodoRead",
  "WebFetch",
  "WebSearch",
])

const WRITE_TOOLS = new Set([
  "Edit",
  "MultiEdit",
  "Write",
  "NotebookEdit",
])

const APPROVAL_TOOLS = new Set([
  "AskUserQuestion",
  "ExitPlanMode",
  "TodoWrite",
  "PlanWrite",
])

const READ_ONLY_COMMAND_PATTERNS = [
  /^pwd$/,
  /^ls(?:\s+-[A-Za-z0-9]+)*(?:\s+\S+)?$/,
  /^git\s+status(?:\s+--short|\s+--porcelain(?:=\S+)?)?$/,
  /^git\s+diff(?:\s+--stat|\s+--name-only|\s+--name-status)?(?:\s+--\s+\S+)?$/,
  /^git\s+log(?:\s+--oneline)?(?:\s+-n\s+\d+|\s+-\d+)?$/,
  /^git\s+rev-parse\s+(?:--show-toplevel|--abbrev-ref\s+HEAD|HEAD)$/,
  /^rg(?:\s+-[A-Za-z0-9-]+)*(?:\s+\S+){0,4}$/,
  /^find\s+\S+(?:\s+-maxdepth\s+\d+)?(?:\s+-type\s+[fd])?(?:\s+-name\s+\S+)?$/,
]

export function classifyClaudeTool(toolName: string): ClaudeToolCategory {
  if (READ_TOOLS.has(toolName)) return "read"
  if (WRITE_TOOLS.has(toolName)) return "write"
  if (toolName === "Bash") return "shell"
  if (APPROVAL_TOOLS.has(toolName)) return "approval"
  if (toolName.startsWith("mcp__")) return "unknown"
  return "unknown"
}

export function extractClaudeToolPaths(
  cwd: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): string[] {
  const rawPaths: unknown[] = []

  if (
    toolName === "Read" ||
    toolName === "Edit" ||
    toolName === "MultiEdit" ||
    toolName === "Write" ||
    toolName === "NotebookEdit"
  ) {
    rawPaths.push(toolInput.file_path, toolInput.path, toolInput.notebook_path)
  } else if (toolName === "Glob" || toolName === "Grep" || toolName === "LS") {
    rawPaths.push(toolInput.path)
  }

  const paths = new Set<string>()
  for (const rawPath of rawPaths) {
    const normalized = normalizeToolPathInsideCwd(cwd, rawPath)
    if (normalized) paths.add(normalized)
  }

  return [...paths]
}

function createGuardEvent(
  contract: ValidatedAgentScopeContract,
  type: AgentGuardEvent["type"],
  details: Omit<AgentGuardEvent, "id" | "runId" | "contractId" | "type" | "createdAt">,
): AgentGuardEvent {
  return {
    id: crypto.randomUUID(),
    runId: contract.runId ?? contract.id,
    contractId: contract.id,
    type,
    createdAt: new Date().toISOString(),
    ...details,
  }
}

function globToRegex(glob: string): RegExp {
  let output = "^"
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index]
    const next = glob[index + 1]

    if (char === "*" && next === "*") {
      output += ".*"
      index++
    } else if (char === "*") {
      output += "[^/]*"
    } else if (char === "?") {
      output += "[^/]"
    } else {
      output += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    }
  }
  output += "$"
  return new RegExp(output)
}

export function isScopePathMatch(targetPath: string, scopePath: AgentScopePath): boolean {
  const normalizedTarget = normalizeContractRelativePath(targetPath, {
    allowGlobWildcards: false,
  })
  const normalizedScope = normalizeContractRelativePath(scopePath.path, {
    allowGlobWildcards: scopePath.kind === "glob",
  })

  if (scopePath.kind === "file") {
    return normalizedTarget === normalizedScope
  }

  if (scopePath.kind === "directory") {
    return (
      normalizedTarget === normalizedScope ||
      normalizedTarget.startsWith(`${normalizedScope.replace(/\/$/, "")}/`)
    )
  }

  return globToRegex(normalizedScope).test(normalizedTarget)
}

export function isPathBlockedByContract(
  contract: ValidatedAgentScopeContract,
  targetPath: string,
): boolean {
  return (
    isSensitiveScopePath(targetPath) ||
    contract.blockedPaths.some((scopePath) => isScopePathMatch(targetPath, scopePath))
  )
}

export function isPathInEditableScope(
  contract: ValidatedAgentScopeContract,
  targetPath: string,
): boolean {
  if (isPathBlockedByContract(contract, targetPath)) return false
  return contract.editableScope.some((scopePath) => isScopePathMatch(targetPath, scopePath))
}

function getShellCommand(toolInput: Record<string, unknown>): string {
  const raw = toolInput.command ?? toolInput.cmd
  return typeof raw === "string" ? raw.trim() : ""
}

function isApprovedSuccessCheck(
  contract: ValidatedAgentScopeContract,
  command: string,
): boolean {
  return contract.successChecks.some((check) => check.command.trim() === command)
}

function isReadOnlyInspectionCommand(command: string): boolean {
  if (!command || command.length > 300) return false
  if (containsShellControl(command) || isHighRiskCommand(command)) return false
  if (/(?:^|\s)(?:\.env(?:\.|\b)|id_rsa\b|id_ed25519\b|[^/\s]+\.pem\b|[^/\s]+\.key\b)/i.test(command)) {
    return false
  }
  return READ_ONLY_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
}

export function decideClaudeToolUse({
  contract,
  toolName,
  toolInput,
  toolUseId,
}: DecideClaudeToolUseInput): AgentGuardDecision {
  const category = classifyClaudeTool(toolName)

  if (category === "approval" || category === "read") {
    return {
      decision: "allow",
      reason: `${toolName} is allowed in guarded runs.`,
      event: createGuardEvent(contract, "allowed", {
        toolName,
        toolUseId,
        reason: `${toolName} is allowed in guarded runs.`,
      }),
      updatedInput: toolInput,
    }
  }

  if (category === "write") {
    const paths = extractClaudeToolPaths(contract.cwd, toolName, toolInput)
    if (paths.length === 0) {
      return {
        decision: "deny",
        reason: `${toolName} did not provide a project-local target path.`,
        event: createGuardEvent(contract, "blocked", {
          toolName,
          toolUseId,
          reason: `${toolName} did not provide a project-local target path.`,
        }),
      }
    }

    const blockedPath = paths.find((targetPath) => isPathBlockedByContract(contract, targetPath))
    if (blockedPath) {
      return {
        decision: "deny",
        reason: `Guarded run blocked ${toolName} from touching protected path "${blockedPath}".`,
        event: createGuardEvent(contract, "blocked", {
          toolName,
          toolUseId,
          path: blockedPath,
          paths,
          reason: `Protected path "${blockedPath}" is outside guarded-run policy.`,
        }),
      }
    }

    const outOfScopePath = paths.find((targetPath) => !isPathInEditableScope(contract, targetPath))
    if (outOfScopePath) {
      return {
        decision: "request-expansion",
        requestedPath: outOfScopePath,
        reason: `Guarded run requires approval before ${toolName} can edit "${outOfScopePath}".`,
        event: createGuardEvent(contract, "scope-expansion-request", {
          toolName,
          toolUseId,
          path: outOfScopePath,
          paths,
          reason: `Requested editable scope expansion for "${outOfScopePath}".`,
        }),
      }
    }

    return {
      decision: "allow",
      reason: `${toolName} targets approved editable scope.`,
      event: createGuardEvent(contract, "allowed", {
        toolName,
        toolUseId,
        paths,
        reason: `${toolName} targets approved editable scope.`,
      }),
      updatedInput: toolInput,
    }
  }

  if (category === "shell") {
    const command = getShellCommand(toolInput)
    if (!command) {
      return {
        decision: "deny",
        reason: "Bash command is empty or missing.",
        event: createGuardEvent(contract, "blocked", {
          toolName,
          toolUseId,
          reason: "Bash command is empty or missing.",
        }),
      }
    }

    if (isApprovedSuccessCheck(contract, command)) {
      return {
        decision: "allow",
        reason: "Bash command matches an approved success check.",
        event: createGuardEvent(contract, "allowed", {
          toolName,
          toolUseId,
          command,
          reason: "Bash command matches an approved success check.",
        }),
        updatedInput: toolInput,
      }
    }

    if (containsShellControl(command) || isHighRiskCommand(command)) {
      return {
        decision: "deny",
        reason: `Guarded run blocked high-risk or ambiguous shell command: ${command}`,
        event: createGuardEvent(contract, "blocked", {
          toolName,
          toolUseId,
          command,
          reason: "High-risk or ambiguous shell command.",
        }),
      }
    }

    if (isReadOnlyInspectionCommand(command)) {
      return {
        decision: "allow",
        reason: "Bash command is a read-only inspection command.",
        event: createGuardEvent(contract, "allowed", {
          toolName,
          toolUseId,
          command,
          reason: "Read-only inspection command.",
        }),
        updatedInput: toolInput,
      }
    }

    return {
      decision: "deny",
      reason: `Guarded runs require explicit success-check approval for shell command: ${command}`,
      event: createGuardEvent(contract, "blocked", {
        toolName,
        toolUseId,
        command,
        reason: "Shell command is not an approved success check or read-only inspection command.",
      }),
    }
  }

  return {
    decision: "deny",
    reason: `Guarded run blocked unclassified tool "${toolName}" until it is classified.`,
    event: createGuardEvent(contract, "blocked", {
      toolName,
      toolUseId,
      reason: "Unclassified tool in guarded run.",
    }),
  }
}

export function toClaudePermissionResult(
  decision: AgentGuardDecision,
): PermissionResult {
  if (decision.decision === "allow") {
    return {
      behavior: "allow",
      updatedInput: decision.updatedInput,
    }
  }

  return {
    behavior: "deny",
    message:
      decision.decision === "request-expansion"
        ? `${decision.reason} Ask the user to approve a scope expansion, then retry after approval.`
        : decision.reason,
  }
}

export function relativeChangedFilePath(filePath: string): string {
  return filePath.split(path.sep).join("/")
}
