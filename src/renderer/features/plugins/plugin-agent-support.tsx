import {
  SHARED_RUNNABLE_AGENT_IDS,
  SHARED_RUNNABLE_AGENT_SUPPORT_KEY,
  getSharedRunnableAgentLabels,
} from "../agents/lib/shared-agent-support"

export const PLUGIN_RUNNABLE_AGENT_IDS = SHARED_RUNNABLE_AGENT_IDS

export const PLUGIN_RUNNABLE_AGENT_SUPPORT_KEY =
  SHARED_RUNNABLE_AGENT_SUPPORT_KEY

export function getPluginSupportedAgentLabels(): string[] {
  return getSharedRunnableAgentLabels()
}

export function PluginAgentSupportPills({
  className,
  compact = false,
  idPrefix,
}: {
  className?: string
  compact?: boolean
  idPrefix: string
}) {
  const classes = [
    "codex-plugin-agent-strip",
    compact ? "codex-plugin-agent-strip-compact" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      aria-label="Supported agent engines"
      className={classes}
      data-plugin-agent-support={PLUGIN_RUNNABLE_AGENT_SUPPORT_KEY}
    >
      {PLUGIN_RUNNABLE_AGENT_IDS.map((engineId) => (
        <span
          key={`${idPrefix}-${engineId}`}
          className="codex-plugin-agent-chip"
          data-plugin-agent-engine={engineId}
        >
          {getSharedRunnableAgentLabels()[
            PLUGIN_RUNNABLE_AGENT_IDS.indexOf(engineId)
          ] ?? engineId}
        </span>
      ))}
    </div>
  )
}
