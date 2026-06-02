import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInfo } from "../src/main/lib/plugins"
import { scanPluginReviewDocument } from "../src/main/lib/plugins/review-scan"
import {
  buildControlledUiPermissionGrant,
  buildPluginControlledUiGate,
  getControlledUiActionPermissionId,
  getControlledUiGrantStatus,
  isControlledUiGrantCurrent,
  parseControlledUiManifest,
} from "../src/shared/plugin-controlled-ui"
import { diffPluginManifestReviewDocuments } from "../src/shared/plugin-update-review"

function pluginInfo(root: string): PluginInfo {
  return {
    runtime: "claude",
    reviewKey: "claude:local:controlled",
    name: "Controlled",
    version: "1.0.0",
    path: root,
    installRoot: root,
    source: "local:controlled",
    marketplace: "local",
    sourceKind: "local-marketplace",
    sourceTrust: "local",
    targetMode: "manifest-only",
    executionStatus: "not-run-by-locus",
    updatePosture: "advisory-only",
    diagnostics: [],
    sourcePins: [],
  }
}

describe("controlled UI plugin manifest schema", () => {
  test("parses bounded declarative settings, panel, and draft actions", () => {
    const result = parseControlledUiManifest({
      version: 1,
      ignored: "future-field",
      surfaces: [
        {
          id: "review-settings",
          type: "settings-section",
          title: "Review Settings",
          fields: [
            {
              id: "severity",
              type: "select",
              label: "Severity",
              options: ["low", "medium", "high"],
            },
          ],
        },
        {
          id: "review-panel",
          type: "workbench-panel",
          title: "Review Panel",
          items: [
            { type: "text", text: "Prepare a bounded review prompt." },
            { type: "fact", label: "Mode", value: "Read-only" },
          ],
        },
        {
          id: "prepare-review",
          type: "command-button",
          title: "Prepare review",
          label: "Prepare",
          action: {
            type: "insert-chat-draft",
            prompt: "Review the current diff and list blocking issues first.",
          },
        },
      ],
    })

    expect(result.manifest?.surfaces.map((surface) => surface.type)).toEqual([
      "settings-section",
      "workbench-panel",
      "command-button",
    ])
    expect(result.ignoredUnknownFields).toEqual(["manifest.ignored"])
    expect(result.diagnostics).toContainEqual({
      code: "controlled-ui-unknown-field",
      severity: "warning",
      path: "manifest.ignored",
      message: "Controlled UI ignored an unknown manifest field.",
    })
  })

  test("rejects executable, DOM, iframe, webview, and unsupported action declarations", () => {
    expect(parseControlledUiManifest({
      version: 1,
      surfaces: [{
        id: "unsafe",
        type: "command-button",
        title: "Unsafe",
        label: "Run",
        onClick: "steal()",
        action: {
          type: "shell",
          prompt: "rm -rf /",
        },
      }],
    }).diagnostics.map((diagnostic) => diagnostic.code)).toContain("controlled-ui-unsafe-field")

    expect(parseControlledUiManifest({
      version: 1,
      surfaces: [{
        id: "html-view",
        type: "webview",
        title: "Webview",
        src: "https://example.com",
      }],
    }).diagnostics.map((diagnostic) => diagnostic.code)).toContain("controlled-ui-unsupported-surface")

    expect(parseControlledUiManifest({
      version: 1,
      surfaces: [{
        id: "terminal",
        type: "command-button",
        title: "Terminal",
        label: "Run",
        action: {
          type: "run-shell",
          prompt: "echo unsafe",
        },
      }],
    }).diagnostics.map((diagnostic) => diagnostic.code)).toContain("controlled-ui-unsupported-action")
  })

  test("bounds counts and strings", () => {
    expect(parseControlledUiManifest({
      version: 1,
      surfaces: Array.from({ length: 17 }, (_, index) => ({
        id: `surface-${index}`,
        type: "workbench-panel",
        title: "Panel",
      })),
    }).diagnostics).toContainEqual(expect.objectContaining({
      code: "controlled-ui-limit-exceeded",
      path: "surfaces",
    }))

    expect(parseControlledUiManifest({
      version: 1,
      surfaces: [{
        id: "../bad",
        type: "workbench-panel",
        title: "Bad",
      }],
    }).diagnostics).toContainEqual(expect.objectContaining({
      code: "controlled-ui-manifest-invalid",
      path: "surfaces.0.id",
    }))
  })
})

describe("controlled UI plugin gates and grants", () => {
  test("allows reviewed Claude controlled UI outside safe mode", () => {
    expect(buildPluginControlledUiGate({
      runtime: "claude",
      targetMode: "controlled-ui",
      updateReviewStatus: "reviewed",
      safeModeEnabled: false,
      hasValidManifest: true,
      actionSupported: true,
      permissionGranted: true,
    })).toEqual({
      canRenderControlledUi: true,
      canInvokeControlledAction: true,
      reasons: [],
    })
  })

  test("blocks safe mode, unreviewed metadata, and Codex cache packages", () => {
    expect(buildPluginControlledUiGate({
      runtime: "claude",
      targetMode: "controlled-ui",
      updateReviewStatus: "reviewed",
      safeModeEnabled: true,
      hasValidManifest: true,
    })).toMatchObject({
      canRenderControlledUi: false,
      canInvokeControlledAction: false,
      reasons: ["safe-mode"],
    })

    expect(buildPluginControlledUiGate({
      runtime: "claude",
      targetMode: "controlled-ui",
      updateReviewStatus: "changed",
      safeModeEnabled: false,
      hasValidManifest: true,
    }).reasons).toContain("review-changed")

    expect(buildPluginControlledUiGate({
      runtime: "codex",
      targetMode: "controlled-ui",
      updateReviewStatus: "reviewed",
      safeModeEnabled: false,
      hasValidManifest: true,
    }).reasons).toEqual(["codex-read-only-cache", "unsupported-runtime"])
  })

  test("binds controlled UI grants to the current contribution fingerprint", () => {
    const grant = buildControlledUiPermissionGrant({
      pluginReviewKey: "claude:market:review",
      contributionFingerprint: "sha256:one",
      contributionId: "prepare-review",
      permissionId: "controlled-ui.action.insert-chat-draft",
      actionId: "prepare-review",
      grantedAt: "2026-06-02T00:00:00.000Z",
    })

    const current = {
      pluginReviewKey: "claude:market:review",
      contributionFingerprint: "sha256:one",
      contributionId: "prepare-review",
      permissionId: "controlled-ui.action.insert-chat-draft",
      actionId: "prepare-review",
    }

    expect(isControlledUiGrantCurrent(grant, current)).toBe(true)
    expect(getControlledUiGrantStatus(grant, {
      ...current,
      contributionFingerprint: "sha256:two",
    })).toBe("stale")
    expect(getControlledUiGrantStatus(grant, {
      ...current,
      actionId: "other-action",
    })).toBe("mismatch")
  })

  test("derives stable action permission ids from allowlisted actions", () => {
    const result = parseControlledUiManifest({
      version: 1,
      surfaces: [{
        id: "prepare-review",
        type: "command-button",
        title: "Prepare review",
        label: "Prepare",
        action: {
          type: "insert-chat-draft",
          prompt: "Draft a review request.",
        },
      }],
    })
    const button = result.manifest?.surfaces[0]
    expect(button?.type).toBe("command-button")
    if (button?.type !== "command-button") throw new Error("expected command button")
    expect(getControlledUiActionPermissionId(button.action)).toBe(
      "controlled-ui.action.insert-chat-draft",
    )
  })
})

describe("controlled UI main-process review scan", () => {
  test("includes normalized controlled UI declarations in plugin review documents", async () => {
    const root = await mkdtemp(join(tmpdir(), "locus-controlled-ui-plugin-"))
    try {
      await mkdir(join(root, ".locus-plugin"))
      await writeFile(join(root, ".locus-plugin", "ui.json"), JSON.stringify({
        version: 1,
        surfaces: [{
          id: "prepare-review",
          type: "command-button",
          title: "Prepare review",
          label: "Prepare",
          action: {
            type: "insert-chat-draft",
            prompt: "Review the current diff.",
          },
        }],
      }))

      const scan = await scanPluginReviewDocument(pluginInfo(root))

      expect(scan.targetModeSummary).toEqual({
        targetMode: "controlled-ui",
        executionStatus: "locus-controlled",
        updatePosture: "review-before-enable",
      })
      expect(scan.controlledUi.manifest?.surfaces).toHaveLength(1)
      expect(scan.reviewDocument.controlledUi.surfaces[0]).toMatchObject({
        id: "prepare-review",
        type: "command-button",
        action: {
          type: "insert-chat-draft",
          prompt: "Review the current diff.",
        },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("diffs controlled UI contribution changes as review metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "locus-controlled-ui-plugin-"))
    try {
      await mkdir(join(root, ".locus-plugin"))
      const manifestPath = join(root, ".locus-plugin", "ui.json")
      await writeFile(manifestPath, JSON.stringify({
        version: 1,
        surfaces: [{
          id: "prepare-review",
          type: "command-button",
          title: "Prepare review",
          label: "Prepare",
          action: {
            type: "insert-chat-draft",
            prompt: "Review the current diff.",
          },
        }],
      }))
      const first = await scanPluginReviewDocument(pluginInfo(root))

      await writeFile(manifestPath, JSON.stringify({
        version: 1,
        surfaces: [{
          id: "prepare-review",
          type: "command-button",
          title: "Prepare review",
          label: "Prepare",
          action: {
            type: "insert-chat-draft",
            prompt: "Review the current diff and list blocking issues first.",
          },
        }],
      }))
      const second = await scanPluginReviewDocument(pluginInfo(root))

      expect(diffPluginManifestReviewDocuments(
        first.reviewDocument,
        second.reviewDocument,
      )).toContainEqual(expect.objectContaining({
        field: "controlledUi",
      }))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("blocks controlled UI manifest symlinks that escape the plugin root", async () => {
    const root = await mkdtemp(join(tmpdir(), "locus-controlled-ui-plugin-"))
    const outside = await mkdtemp(join(tmpdir(), "locus-controlled-ui-outside-"))
    try {
      await mkdir(join(root, ".locus-plugin"))
      const outsideManifest = join(outside, "ui.json")
      await writeFile(outsideManifest, JSON.stringify({ version: 1, surfaces: [] }))
      await symlink(outsideManifest, join(root, ".locus-plugin", "ui.json"))

      const scan = await scanPluginReviewDocument(pluginInfo(root))
      expect(scan.controlledUi.diagnostics).toContainEqual(expect.objectContaining({
        code: "controlled-ui-unsafe-field",
        severity: "blocked",
      }))
      expect(scan.controlledUi.manifest).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})
