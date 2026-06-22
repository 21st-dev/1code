import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("project lifecycle ownership", () => {
  test("projects router does not raw-delete project rows", () => {
    const source = readFileSync("src/main/lib/trpc/routers/projects.ts", "utf8")
    expect(source).not.toContain(".delete(projects)")
    expect(source).toContain("removeProjectFromActiveListById")
    expect(source).toContain("deleteProjectWithCleanup")
  })
})
