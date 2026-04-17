import { describe, expect, test } from "bun:test"
import { buildTerminalEnv } from "./env"

describe("buildTerminalEnv", () => {
  test("uses OpenCodex as the terminal program identity", () => {
    const env = buildTerminalEnv({
      shell: "/bin/zsh",
      paneId: "pane-1",
      workspaceId: "workspace-1",
      workspaceName: "Demo",
    })

    expect(env.TERM_PROGRAM).toBe("OpenCodex")
  })
})
