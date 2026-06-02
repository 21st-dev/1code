import { describe, expect, test } from "bun:test"
import {
  buildControlledUiPermissionGrant,
  buildPluginControlledUiGate,
  getControlledUiActionPermissionId,
  getControlledUiGrantStatus,
  isControlledUiGrantCurrent,
  parseControlledUiManifest,
} from "../src/shared/plugin-controlled-ui"

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
