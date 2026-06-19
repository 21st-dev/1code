import { describe, expect, test } from "bun:test"
import {
  assessCodexAppServerPluginProtocol,
  extractAcceptedCodexAppServerClientMethods,
  summarizeCodexAppServerPluginProtocolResponse,
} from "../src/main/lib/codex/app-server-plugin-proof"

describe("Codex app-server plugin proof helpers", () => {
  test("summarizes app-server plugin marketplace inventory without raw payloads", () => {
    const observation = summarizeCodexAppServerPluginProtocolResponse(
      "plugin/list",
      {
        result: {
          marketplaces: [
            {
              name: "openai-primary-runtime",
              plugins: [
                {
                  id: "documents@openai-primary-runtime",
                  name: "documents",
                  installed: true,
                  enabled: true,
                },
                {
                  id: "pdf@openai-primary-runtime",
                  name: "pdf",
                  installed: false,
                  enabled: false,
                },
              ],
            },
          ],
          featuredPluginIds: ["documents@openai-primary-runtime"],
        },
      },
    )

    expect(observation).toMatchObject({
      method: "plugin/list",
      ok: true,
      resultKeys: ["marketplaces", "featuredPluginIds"],
      marketplaceCount: 1,
      pluginCount: 2,
      installedPluginCount: 1,
      enabledPluginCount: 1,
      featuredPluginCount: 1,
      sampleNames: [
        "documents@openai-primary-runtime",
        "pdf@openai-primary-runtime",
      ],
    })
  })

  test("summarizes nested skills and hooks list contexts", () => {
    expect(
      summarizeCodexAppServerPluginProtocolResponse("skills/list", {
        result: {
          data: [
            {
              cwd: "/repo",
              skills: [
                { name: "agent-code-architecture" },
                { name: "local-smoke-test" },
              ],
              errors: [],
            },
          ],
        },
      }),
    ).toMatchObject({
      ok: true,
      skillRootCount: 1,
      skillCount: 2,
      sampleNames: ["agent-code-architecture", "local-smoke-test"],
    })

    expect(
      summarizeCodexAppServerPluginProtocolResponse("hooks/list", {
        result: {
          data: [
            {
              cwd: "/repo",
              hooks: [{ name: "pre-run" }],
              warnings: [],
              errors: [],
            },
          ],
        },
      }),
    ).toMatchObject({
      ok: true,
      hookRootCount: 1,
      hookCount: 1,
      sampleNames: ["pre-run"],
    })
  })

  test("extracts accepted client methods from app-server unknown variant errors", () => {
    expect(
      extractAcceptedCodexAppServerClientMethods(
        "Invalid request: unknown variant `plugin/marketplace/list`, expected one of `initialize`, `thread/start`, `thread/settings/update`, `skills/list`, `hooks/list`, `plugin/list`, `plugin/installed`, `plugin/read`, `plugin/skill/read`",
      ),
    ).toEqual([
      "initialize",
      "thread/start",
      "thread/settings/update",
      "skills/list",
      "hooks/list",
      "plugin/list",
      "plugin/installed",
      "plugin/read",
      "plugin/skill/read",
    ])
  })

  test("does not treat global inventory or generic thread settings as per-run plugin control proof", () => {
    const acceptedClientMethods = [
      "initialize",
      "thread/start",
      "thread/settings/update",
      "skills/list",
      "hooks/list",
      "plugin/list",
      "plugin/installed",
      "plugin/read",
      "plugin/skill/read",
    ]
    const assessment = assessCodexAppServerPluginProtocol({
      acceptedClientMethods,
      observations: [
        summarizeCodexAppServerPluginProtocolResponse("plugin/list", {
          result: { marketplaces: [{ plugins: [] }] },
        }),
        summarizeCodexAppServerPluginProtocolResponse("skills/list", {
          result: { data: [{ skills: [] }] },
        }),
        summarizeCodexAppServerPluginProtocolResponse("hooks/list", {
          result: { data: [{ hooks: [] }] },
        }),
      ],
    })

    expect(assessment).toEqual({
      supportsPluginInventory: true,
      supportsSkillInventory: true,
      supportsHookInventory: true,
      exposesGenericThreadSettingsUpdate: true,
      hasTypedPerRunPluginAllowlist: false,
      typedPerRunPluginControlMethods: [],
      observedPluginMethods: [
        "plugin/list",
        "plugin/installed",
        "plugin/read",
        "plugin/skill/read",
      ],
      reasons: [
        "app-server exposes global plugin inventory methods",
        "thread/settings/update is generic and is not proof of plugin allowlist enforcement",
        "no typed per-run plugin allowlist method was observed",
      ],
    })
  })

  test("flags future typed per-run plugin control methods if app-server adds one", () => {
    expect(
      assessCodexAppServerPluginProtocol({
        acceptedClientMethods: ["thread/plugins/update"],
        observations: [],
      }).hasTypedPerRunPluginAllowlist,
    ).toBe(true)
  })
})
