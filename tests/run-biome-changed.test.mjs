import { describe, expect, test } from "bun:test"
import {
  BIOME_JSON_MAX_BUFFER_BYTES,
  COMMAND_MAX_BUFFER_BYTES,
  collectChangedLinesFromUnifiedDiff,
  diagnosticTouchesChangedLines,
  filterDiagnosticsForChangedLines,
  markAllLinesChanged,
  resolveBiomeExecutable,
} from "../scripts/run-biome-changed.mjs"

describe("run-biome-changed helpers", () => {
  test("uses a large buffer for command output", () => {
    expect(COMMAND_MAX_BUFFER_BYTES).toBe(64 * 1024 * 1024)
    expect(BIOME_JSON_MAX_BUFFER_BYTES).toBe(64 * 1024 * 1024)
  })

  test("collects added line numbers from unified diff hunks", () => {
    const changes =
      collectChangedLinesFromUnifiedDiff(`diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,0 +11,2 @@
+const a = 1
+const b = 2
@@ -20,1 +22,1 @@
-const oldValue = 1
+const newValue = 1
`)

    expect([...changes.get("src/a.ts").lines]).toEqual([11, 12, 22])
  })

  test("filters diagnostics to changed lines only", () => {
    const changes =
      collectChangedLinesFromUnifiedDiff(`diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -4,0 +5,1 @@
+const value = 1
`)
    const diagnostics = [
      {
        severity: "error",
        message: "legacy",
        location: { path: "src/a.ts", start: { line: 2, column: 1 } },
      },
      {
        severity: "error",
        message: "changed",
        location: { path: "src/a.ts", start: { line: 5, column: 1 } },
      },
    ]

    expect(filterDiagnosticsForChangedLines(diagnostics, changes)).toEqual([
      diagnostics[1],
    ])
  })

  test("treats untracked files as fully changed", () => {
    const changes = markAllLinesChanged(new Map(), ["src/new.ts"])
    expect(
      diagnosticTouchesChangedLines(
        {
          severity: "error",
          message: "new file diagnostic",
          location: { path: "src/new.ts", start: { line: 99, column: 1 } },
        },
        changes,
      ),
    ).toBe(true)
  })

  test("ignores file-level diagnostics for legacy lines in modified files", () => {
    const changes =
      collectChangedLinesFromUnifiedDiff(`diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -9,0 +10,1 @@
+const value = 1
`)

    expect(
      diagnosticTouchesChangedLines(
        {
          severity: "error",
          message: "legacy file-level format diagnostic",
          location: { path: "src/a.ts", start: { line: 0, column: 0 } },
        },
        changes,
      ),
    ).toBe(false)
  })

  test("fails closed when the local Biome executable is missing", () => {
    expect(
      resolveBiomeExecutable({
        cwd: "/repo",
        platform: "darwin",
        exists: () => false,
      }),
    ).toEqual({
      ok: false,
      error:
        "Biome executable not found at /repo/node_modules/.bin/biome. Run `bun install` before linting.",
    })
  })
})
