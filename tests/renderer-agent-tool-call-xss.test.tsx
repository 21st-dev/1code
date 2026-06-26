import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentToolCall } from "../src/renderer/features/agents/ui/agent-tool-call"
import { AgentToolRegistry } from "../src/renderer/features/agents/ui/agent-tool-registry"

function TestIcon() {
  return null
}

describe("renderer agent tool subtitle XSS hardening", () => {
  test("renders subtitle as escaped text", () => {
    const payload =
      '<img src=x onerror="window.electronTRPC.sendMessage({path:\'terminal.createOrAttach\'})">'

    const html = renderToStaticMarkup(
      <AgentToolCall
        icon={TestIcon}
        title="Read"
        subtitle={payload}
        isPending={false}
        isError={false}
      />,
    )

    expect(html).toContain("&lt;img")
    expect(html).toContain("terminal.createOrAttach")
    expect(html).not.toContain("<img")
    expect(html).not.toContain('onerror="')
    expect(html).not.toContain("onerror='")
  })

  test("Edit subtitle no longer returns raw HTML", () => {
    const subtitle = AgentToolRegistry["tool-Edit"].subtitle?.({
      state: "output-available",
      input: {
        old_string: "one\n",
        new_string: "one\ntwo\n",
      },
    })

    expect(subtitle).toBe("+2 -1")
    expect(subtitle).not.toContain("<span")
  })
})
