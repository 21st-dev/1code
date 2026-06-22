import { describe, expect, test } from "bun:test"
import { stripCodexAnsi } from "../src/main/lib/codex/acp-spawn-probe"

describe("Codex ANSI cleanup", () => {
  test("strips terminal control sequences", () => {
    expect(stripCodexAnsi("\u001B[31mred\u001B[0m")).toBe("red")
    expect(stripCodexAnsi("\u001B]0;title\u0007hello")).toBe("hello")
  })
})
