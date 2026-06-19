export type ClaudeNativePluginStagingFailureReason =
  | "source-missing"
  | "symlink-failed"
  | "stage-failed"
  | "marketplace-manifest-failed"

export interface ClaudeNativePluginStagingFailure {
  pluginSource: string
  marketplace: string
  name: string
  path: string
  reason: ClaudeNativePluginStagingFailureReason
  recordedAt: string
}

export interface ClaudeNativePluginStagingFailureInput {
  pluginSource: string
  marketplace: string
  name: string
  path: string
  reason: ClaudeNativePluginStagingFailureReason
}

const stagingFailures = new Map<string, ClaudeNativePluginStagingFailure>()

export function replaceClaudeNativePluginStagingFailures(
  failures: ClaudeNativePluginStagingFailureInput[],
  now = new Date(),
): ClaudeNativePluginStagingFailure[] {
  stagingFailures.clear()
  const recordedAt = now.toISOString()
  for (const failure of failures) {
    stagingFailures.set(failure.pluginSource, {
      ...failure,
      recordedAt,
    })
  }
  return getClaudeNativePluginStagingFailures()
}

export function getClaudeNativePluginStagingFailure(
  pluginSource: string,
): ClaudeNativePluginStagingFailure | undefined {
  return stagingFailures.get(pluginSource)
}

export function getClaudeNativePluginStagingFailures(): ClaudeNativePluginStagingFailure[] {
  return Array.from(stagingFailures.values()).sort((a, b) =>
    a.pluginSource.localeCompare(b.pluginSource),
  )
}

export function hasClaudeNativePluginStagingFailure(
  pluginSource: string,
): boolean {
  return Boolean(getClaudeNativePluginStagingFailure(pluginSource))
}

export function clearClaudeNativePluginStagingFailures(): void {
  stagingFailures.clear()
}
