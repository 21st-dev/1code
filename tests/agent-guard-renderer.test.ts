import { describe, expect, test } from "bun:test"
import {
  buildGuardedRunDraftSeed,
  extractLocalMentionPaths,
  parseScopePathLines,
  serializeScopePaths,
} from "../src/renderer/features/agents/lib/agent-guard-draft"

describe("agent guard renderer helpers", () => {
  test("parses manual scope text into file, directory, and glob entries", () => {
    expect(
      parseScopePathLines(`
        - src/main.ts
        docs/
        tests/**/*.test.ts
      `),
    ).toEqual([
      { path: "src/main.ts", kind: "file", source: "manual" },
      { path: "docs/", kind: "directory", source: "manual" },
      { path: "tests/**/*.test.ts", kind: "glob", source: "manual" },
    ])
  })

  test("extracts local file and folder mentions from the draft", () => {
    expect(
      extractLocalMentionPaths(
        "edit @[file:local:src/app.ts] and @[folder:local:src/components/]",
      ),
    ).toMatchObject([
      { path: "src/app.ts", kind: "file", source: "selection" },
      { path: "src/components/", kind: "directory", source: "selection" },
    ])
  })

  test("seeds editable scope from changed files and mentions", () => {
    const seed = buildGuardedRunDraftSeed({
      changedFiles: [
        {
          filePath: "src/changed.ts",
          displayPath: "src/changed.ts",
          additions: 2,
          deletions: 1,
        },
      ],
      textContexts: [],
      diffTextContexts: [
        {
          id: "diff_1",
          text: "context",
          filePath: "src/evidence.ts",
          preview: "context",
          createdAt: new Date("2026-05-29T00:00:00.000Z"),
        },
      ],
      draftText: "also touch @[file:local:src/mentioned.ts]",
    })

    expect(serializeScopePaths(seed.editableScope)).toBe(
      "src/changed.ts\nsrc/mentioned.ts",
    )
    expect(seed.readOnlyEvidence).toMatchObject([
      { path: "src/evidence.ts", kind: "file", source: "selection" },
    ])
    expect(seed.sourceLabels).toMatchObject({
      "src/changed.ts": "changed",
      "src/mentioned.ts": "mentioned",
      "src/evidence.ts": "diff",
    })
  })
})
