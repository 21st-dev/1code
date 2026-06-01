import type { AgentScopePath } from "../../../../shared/agent-scope-contracts"
import type { SubChatFileChange } from "../atoms"
import type { DiffTextContext, SelectedTextContext } from "./queue-utils"

export type GuardedRunDraftSeed = {
  editableScope: AgentScopePath[]
  readOnlyEvidence: AgentScopePath[]
  sourceLabels: Record<string, string>
}

const PATH_TOKEN_PATTERN = /@\[(file|folder):local:([^\]]+)\]/g

export function inferScopePathKind(path: string): AgentScopePath["kind"] {
  if (/[*?[\]{}]/.test(path)) return "glob"
  if (path.endsWith("/")) return "directory"
  return "file"
}

export function parseScopePathLines(
  text: string,
  source = "manual",
): AgentScopePath[] {
  const seen = new Set<string>()
  const paths: AgentScopePath[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const path = rawLine
      .trim()
      .replace(/^[-*]\s+/, "")
      .replace(/^\.?\//, "")
      .trim()
    if (!path || seen.has(path)) continue
    seen.add(path)
    paths.push({
      path,
      kind: inferScopePathKind(path),
      source,
    })
  }

  return paths
}

export function serializeScopePaths(paths: AgentScopePath[]): string {
  return paths.map((item) => item.path).join("\n")
}

export function extractLocalMentionPaths(draftText: string): AgentScopePath[] {
  const paths: AgentScopePath[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = PATH_TOKEN_PATTERN.exec(draftText)) !== null) {
    const [, mentionType, rawPath] = match
    const path = rawPath.trim().replace(/^\.?\//, "")
    if (!path || seen.has(path)) continue
    seen.add(path)
    paths.push({
      path,
      kind: mentionType === "folder" ? "directory" : inferScopePathKind(path),
      source: "selection",
    })
  }

  return paths
}

export function buildGuardedRunDraftSeed({
  changedFiles,
  textContexts,
  diffTextContexts,
  draftText,
}: {
  changedFiles: SubChatFileChange[]
  textContexts: SelectedTextContext[]
  diffTextContexts: DiffTextContext[]
  draftText: string
}): GuardedRunDraftSeed {
  const editableScope: AgentScopePath[] = []
  const readOnlyEvidence: AgentScopePath[] = []
  const sourceLabels: Record<string, string> = {}
  const editableSeen = new Set<string>()
  const evidenceSeen = new Set<string>()

  const addEditable = (item: AgentScopePath, label: string) => {
    if (editableSeen.has(item.path)) return
    editableSeen.add(item.path)
    sourceLabels[item.path] = label
    editableScope.push(item)
  }
  const addEvidence = (item: AgentScopePath, label: string) => {
    if (evidenceSeen.has(item.path)) return
    evidenceSeen.add(item.path)
    sourceLabels[item.path] = label
    readOnlyEvidence.push(item)
  }

  for (const file of changedFiles) {
    addEditable(
      {
        path: file.filePath,
        kind: inferScopePathKind(file.filePath),
        source: "git",
        reason: "Changed in this sub-chat.",
      },
      "changed",
    )
  }

  for (const item of extractLocalMentionPaths(draftText)) {
    addEditable(item, "mentioned")
  }

  for (const context of diffTextContexts) {
    addEvidence(
      {
        path: context.filePath,
        kind: inferScopePathKind(context.filePath),
        source: "selection",
        reason: "Selected diff context.",
      },
      "diff",
    )
  }

  if (textContexts.length > 0) {
    sourceLabels["selected message text"] = "chat"
  }

  return { editableScope, readOnlyEvidence, sourceLabels }
}
