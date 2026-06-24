import { describe, expect, test } from "bun:test"
import {
  AGENT_ENGINE_UI_DEFINITIONS,
  CUSTOM_ACP_DEFAULT_MODEL_ID,
  DEFAULT_RUNNABLE_AGENT_ENGINE_ID,
  buildRuntimeEngineListState,
  formatRuntimeModelLabel,
  isRunnableAgentEngineId,
  mapRuntimeEnginesToUiDefinitions,
} from "./agent-runtime"
import { CODEX_DEFAULT_MODEL_ID } from "./models"

describe("mapRuntimeEnginesToUiDefinitions", () => {
  test("defaults new agent sessions to the Moss-native Hermes runtime", () => {
    expect(DEFAULT_RUNNABLE_AGENT_ENGINE_ID).toBe("hermes")
  })

  test("returns static fallback definitions before runtime data loads", () => {
    expect(mapRuntimeEnginesToUiDefinitions(undefined)).toEqual(
      AGENT_ENGINE_UI_DEFINITIONS,
    )
  })

  test("marks unavailable engines as disabled with status labels", () => {
    const engines = mapRuntimeEnginesToUiDefinitions([
      {
        id: "claude-code",
        label: "Claude Code",
        availability: "needs-auth",
        statusReason: "No token found.",
        defaultModelId: "opus",
      },
      {
        id: "codex",
        label: "OpenAI Codex",
        availability: "available",
        authMethod: "oauth",
        defaultModelId: CODEX_DEFAULT_MODEL_ID,
      },
      {
        id: "hermes",
        label: "Hermes",
        availability: "unsupported",
        statusReason: "No transport.",
      },
      {
        id: "custom-acp",
        label: "Custom ACP",
        availability: "unsupported",
        statusReason: "No adapter.",
      },
    ])

    expect(engines).toMatchObject([
      {
        id: "claude-code",
        disabled: true,
        statusLabel: "Needs auth",
        statusReason: "No token found.",
      },
      {
        id: "codex",
        disabled: false,
        statusLabel: undefined,
        authMethod: "oauth",
      },
      {
        id: "hermes",
        disabled: true,
        statusLabel: "Unsupported",
        statusReason: "No transport.",
      },
      {
        id: "custom-acp",
        disabled: true,
        statusLabel: "Unsupported",
        statusReason: "No adapter.",
      },
    ])
  })

  test("keeps Custom ACP visible but disabled until an adapter is configured", () => {
    const customAcp = AGENT_ENGINE_UI_DEFINITIONS.find(
      (engine) => engine.id === "custom-acp",
    )

    expect(customAcp).toMatchObject({
      id: "custom-acp",
      name: "Custom ACP",
      disabled: true,
      availability: "unsupported",
      statusLabel: "Unsupported",
      defaultModelLabel: "custom-acp",
    })
  })

  test("treats Custom ACP as a valid renderer engine while runtime availability controls selection", () => {
    expect(isRunnableAgentEngineId("custom-acp")).toBe(true)
    expect(isRunnableAgentEngineId("unknown-engine")).toBe(false)

    const [customAcp] = mapRuntimeEnginesToUiDefinitions([
      {
        id: "custom-acp",
        label: "Custom ACP",
        availability: "available",
        defaultModelId: CUSTOM_ACP_DEFAULT_MODEL_ID,
      },
    ])

    expect(customAcp).toMatchObject({
      id: "custom-acp",
      disabled: false,
      availability: "available",
      defaultModelLabel: CUSTOM_ACP_DEFAULT_MODEL_ID,
      statusLabel: undefined,
    })
    expect(formatRuntimeModelLabel(customAcp?.defaultModelLabel)).toBe(
      "Custom ACP Default",
    )
  })

  test("falls back to static state for unknown availability values", () => {
    const [hermes] = mapRuntimeEnginesToUiDefinitions([
      {
        id: "hermes",
        label: "Hermes",
        availability: "experimental",
      },
    ])

    expect(hermes).toMatchObject({
      id: "hermes",
      disabled: false,
      availability: "available",
      statusLabel: "Fallback",
      fallback: true,
    })
  })

  test("maps Hermes default runtime model to Moss display label", () => {
    const [, , hermes] = mapRuntimeEnginesToUiDefinitions([
      {
        id: "claude-code",
        availability: "available",
      },
      {
        id: "codex",
        availability: "available",
      },
      {
        id: "hermes",
        label: "Hermes",
        availability: "available",
        defaultModelId: "moss-default",
      },
    ])

    expect(hermes?.defaultModelLabel).toBe("moss-default")
    expect(formatRuntimeModelLabel(hermes?.defaultModelLabel)).toBe("Moss Default")
  })

  test("builds a loading state for every engine before health resolves", () => {
    const state = buildRuntimeEngineListState({ isLoading: true })

    expect(state.kind).toBe("loading")
    expect(state.engines).toEqual(AGENT_ENGINE_UI_DEFINITIONS)
    expect(
      state.engines
        .filter((engine) => engine.id !== "custom-acp")
        .every((engine) => engine.disabled !== true),
    ).toBe(true)
  })

  test("builds an empty state instead of hiding all engines", () => {
    const state = buildRuntimeEngineListState({ engines: [] })

    expect(state.kind).toBe("empty")
    expect(state.engines).toHaveLength(AGENT_ENGINE_UI_DEFINITIONS.length)
    expect(state.engines.every((engine) => engine.disabled)).toBe(true)
    expect(state.engines.map((engine) => engine.statusLabel)).toEqual([
      "No engines",
      "No engines",
      "No engines",
      "No engines",
    ])
  })

  test("builds an error state for every engine when health query fails", () => {
    const state = buildRuntimeEngineListState({
      isError: true,
      errorMessage: "health endpoint failed",
    })

    expect(state.kind).toBe("error")
    expect(state.isError).toBe(true)
    expect(state.message).toBe("health endpoint failed")
    expect(state.engines.every((engine) => engine.disabled)).toBe(true)
    expect(state.engines.map((engine) => engine.statusLabel)).toEqual([
      "Runtime error",
      "Runtime error",
      "Runtime error",
      "Runtime error",
    ])
  })

  test("surfaces fallback list state when any engine has unknown availability", () => {
    const state = buildRuntimeEngineListState({
      engines: [
        {
          id: "hermes",
          label: "Hermes",
          availability: "experimental",
        },
      ],
    })

    expect(state.kind).toBe("fallback")
    expect(state.isFallback).toBe(true)
    expect(state.engines[0]).toMatchObject({
      id: "hermes",
      disabled: false,
      statusLabel: "Fallback",
      fallback: true,
    })
  })
})
