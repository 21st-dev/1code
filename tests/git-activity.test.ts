import { describe, expect, test } from "bun:test"
import {
  extractChangedFiles,
  isSuccessfulFileChangeToolPart,
} from "../src/renderer/features/agents/utils/git-activity"

describe("git activity changed-file extraction", () => {
  test("counts successful write and edit tool parts", () => {
    const parts = [
      {
        type: "tool-Write",
        state: "result",
        input: {
          file_path: "/Users/ethan/.21st/worktrees/repo/branch/src/new.ts",
          content: "one\ntwo",
        },
        output: { type: "create" },
      },
      {
        type: "tool-Edit",
        state: "result",
        input: {
          file_path: "/repo/src/existing.ts",
          old_string: "old",
          new_string: "new\nvalue",
        },
        output: { type: "update" },
      },
    ]

    expect(parts.every(isSuccessfulFileChangeToolPart)).toBe(true)
    expect(extractChangedFiles(parts)).toEqual([
      {
        filePath: "/Users/ethan/.21st/worktrees/repo/branch/src/new.ts",
        displayPath: "src/new.ts",
        additions: 2,
        deletions: 0,
      },
      {
        filePath: "/repo/src/existing.ts",
        displayPath: "existing.ts",
        additions: 2,
        deletions: 1,
      },
    ])
  })

  test("does not report denied or unfinished write attempts as changed files", () => {
    const parts = [
      {
        type: "tool-Write",
        state: "output-error",
        input: {
          file_path: "/repo/.env",
          content: "SECRET=1",
        },
        errorText: "Observed mode blocked Write: sensitive path",
      },
      {
        type: "tool-Edit",
        state: "call",
        input: {
          file_path: "/repo/src/pending.ts",
          old_string: "old",
          new_string: "new",
        },
      },
    ]

    expect(parts.some(isSuccessfulFileChangeToolPart)).toBe(false)
    expect(extractChangedFiles(parts)).toEqual([])
  })
})
