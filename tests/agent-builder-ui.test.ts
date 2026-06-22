import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("Agent Builder UI wiring", () => {
  test("renders the read model instead of the legacy agent lists", () => {
    const source = readFileSync(
      "src/renderer/components/dialogs/settings-tabs/agents-app-agents-tab.tsx",
      "utf8",
    )

    expect(source).toContain("trpc.agentBuilder.list.useQuery")
    expect(source).toContain("AgentBuilderReadOnlyDetail")
    expect(source).toContain("t(agentSourceLabelKey(agent.source))")
    expect(source).toContain('agent.mutability === "read-only"')
    expect(source).not.toContain("trpc.appAgents.list.useQuery")
    expect(source).not.toContain("trpc.agents.")
  })
})
