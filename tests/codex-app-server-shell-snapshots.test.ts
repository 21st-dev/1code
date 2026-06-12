import { describe, expect, test } from "bun:test"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  assertCodexAppServerShellSnapshotsScrubbed,
  CodexAppServerShellSnapshotScrubError,
  resolveCodexAppServerShellSnapshotsDir,
  scrubCodexAppServerShellSnapshotText,
  scrubCodexAppServerShellSnapshots,
} from "../src/main/lib/codex/app-server-shell-snapshots"

describe("Codex app-server shell snapshot secret scrubber", () => {
  test("removes Locus-owned secret env lines and redacts exact leftover values", () => {
    const scrubbed = scrubCodexAppServerShellSnapshotText(
      [
        "export PATH=/usr/bin",
        "export LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN=gateway-secret",
        "printf gateway-secret",
        "export CODEX_API_KEY=sk-app-managed-secret",
        "printf sk-app-managed-secret",
      ].join("\n"),
      [
        {
          envName: "LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN",
          value: "gateway-secret",
        },
        { envName: "CODEX_API_KEY", value: "sk-app-managed-secret" },
      ],
    )

    expect(scrubbed.removedEnvLines).toBe(2)
    expect(scrubbed.redactedValueOccurrences).toBe(2)
    expect(scrubbed.content).toContain("export PATH=/usr/bin")
    expect(scrubbed.content).not.toContain(
      "LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN",
    )
    expect(scrubbed.content).not.toContain("CODEX_API_KEY")
    expect(scrubbed.content).not.toContain("gateway-secret")
    expect(scrubbed.content).not.toContain("sk-app-managed-secret")
    expect(scrubbed.content).toContain("<redacted:locus-codex-secret>")
  })

  test("scrubs shell snapshots under explicit CODEX_HOME without deleting unrelated content", () => {
    const codexHome = mkdtempSync(join(tmpdir(), "locus-codex-home-"))
    try {
      const snapshotDir = join(codexHome, "shell_snapshots")
      mkdirSync(snapshotDir, { recursive: true })
      const snapshot = join(snapshotDir, "snapshot.sh")
      writeFileSync(
        snapshot,
        [
          "export FOO=bar",
          "export LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN=selected-token",
          "printf selected-token",
        ].join("\n"),
      )
      const unrelated = join(snapshotDir, "unrelated.sh")
      writeFileSync(unrelated, "export FOO=bar\n")
      symlinkSync(unrelated, join(snapshotDir, "linked.sh"))

      const result = scrubCodexAppServerShellSnapshots({
        runtimeEnv: {
          CODEX_HOME: codexHome,
          LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN: "selected-token",
        },
      })

      expect(result.snapshotDir).toBe(snapshotDir)
      expect(result.scannedFiles).toBe(2)
      expect(result.scrubbedFiles).toBe(1)
      expect(result.removedEnvLines).toBe(1)
      expect(result.redactedValueOccurrences).toBe(1)
      expect(result.skippedFiles).toBe(1)
      expect(result.errors).toBe(0)
      expect(readFileSync(snapshot, "utf8")).not.toContain(
        "LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN",
      )
      expect(readFileSync(snapshot, "utf8")).not.toContain("selected-token")
      expect(readFileSync(unrelated, "utf8")).toBe("export FOO=bar\n")
    } finally {
      rmSync(codexHome, { recursive: true, force: true })
    }
  })

  test("uses HOME/.codex when CODEX_HOME is not present", () => {
    const home = mkdtempSync(join(tmpdir(), "locus-codex-home-default-"))
    try {
      const snapshotDir = join(home, ".codex", "shell_snapshots")
      mkdirSync(snapshotDir, { recursive: true })
      const snapshot = join(snapshotDir, "snapshot.sh")
      writeFileSync(snapshot, "export CODEX_API_KEY=sk-selected\n")

      expect(
        resolveCodexAppServerShellSnapshotsDir({ HOME: home }),
      ).toBe(snapshotDir)

      const result = scrubCodexAppServerShellSnapshots({
        runtimeEnv: {
          HOME: home,
          CODEX_API_KEY: "sk-selected",
        },
      })

      expect(result.scrubbedFiles).toBe(1)
      expect(readFileSync(snapshot, "utf8")).not.toContain("CODEX_API_KEY")
      expect(readFileSync(snapshot, "utf8")).not.toContain("sk-selected")
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test("treats scrub errors as fail-closed", () => {
    const result = {
      snapshotDir: "/tmp/missing",
      scannedFiles: 0,
      scrubbedFiles: 0,
      removedEnvLines: 0,
      redactedValueOccurrences: 0,
      skippedFiles: 0,
      errors: 1,
    }

    expect(() =>
      assertCodexAppServerShellSnapshotsScrubbed(result, "pre-start"),
    ).toThrow(CodexAppServerShellSnapshotScrubError)
  })
})
