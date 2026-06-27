import type { AgentPermissionMode } from "./types"

export type CodexAppServerRuntimeMode =
  | "approval-required"
  | "auto-accept-edits"
  | "full-access"

export type CodexAppServerApprovalPolicy =
  | "untrusted"
  | "on-failure"
  | "on-request"
  | "never"

export type CodexAppServerSandboxMode =
  | "read-only"
  | "workspace-write"
  | "danger-full-access"

export interface CodexAppServerPolicyResolution {
  runtimeMode: CodexAppServerRuntimeMode
  approvalPolicy?: CodexAppServerApprovalPolicy
  sandboxMode?: CodexAppServerSandboxMode
  bypassApprovalsAndSandbox: boolean
  usesCodexConfigDefaults: boolean
  notes: string[]
}

export function resolveCodexAppServerPolicies(
  permissionMode: AgentPermissionMode,
): CodexAppServerPolicyResolution {
  if (permissionMode === "bypass" || permissionMode === "full-access") {
    return {
      runtimeMode: "full-access",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      bypassApprovalsAndSandbox: true,
      usesCodexConfigDefaults: false,
      notes: [
        permissionMode === "full-access"
          ? "Moss full-access maps to Codex app-server full-access runtime."
          : "Moss bypass maps to Codex app-server full-access runtime.",
      ],
    }
  }

  if (permissionMode === "custom") {
    return {
      runtimeMode: "approval-required",
      bypassApprovalsAndSandbox: false,
      usesCodexConfigDefaults: true,
      notes: [
        "Moss custom permissions defer app-server approval and sandbox overrides to Codex config.",
      ],
    }
  }

  if (permissionMode === "plan" || permissionMode === "read-only") {
    return {
      runtimeMode: "approval-required",
      approvalPolicy: "untrusted",
      sandboxMode: "read-only",
      bypassApprovalsAndSandbox: false,
      usesCodexConfigDefaults: false,
      notes: [
        "Moss read-only permissions map to Codex app-server approval-required runtime.",
      ],
    }
  }

  if (permissionMode === "ask-approval") {
    return {
      runtimeMode: "auto-accept-edits",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      bypassApprovalsAndSandbox: false,
      usesCodexConfigDefaults: false,
      notes: [
        "Moss ask-approval maps to workspace-write with on-request approvals.",
      ],
    }
  }

  return {
    runtimeMode: "auto-accept-edits",
    approvalPolicy: "never",
    sandboxMode: "workspace-write",
    bypassApprovalsAndSandbox: false,
    usesCodexConfigDefaults: false,
    notes: [
      "Legacy Moss agent permissions keep Codex app-server workspace writes with approvals disabled for compatibility.",
    ],
  }
}
