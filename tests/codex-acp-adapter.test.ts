import { describe, expect, test } from "bun:test"

const { collectDescendantProcessIds } = await import(
  "../src/main/lib/codex/acp-adapter"
)

describe("Codex ACP adapter lifecycle", () => {
  test("collects descendant process ids in leaf-first order", () => {
    const processTable = `
        100     1
        101   100
        102   101
        103   100
        104   999
        105   102
    `

    expect(collectDescendantProcessIds(processTable, 100)).toEqual([
      105,
      102,
      101,
      103,
    ])
    expect(collectDescendantProcessIds(processTable, 104)).toEqual([])
  })
})
