import { describe, expect, test } from "bun:test"
import {
  createExperimentalRuntimeUiStreamState,
  finalizeExperimentalRuntimeUiStream,
  normalizeExperimentalRuntimeUiChunk,
} from "../src/renderer/features/agents/lib/qwen-ui-stream-normalizer"

describe("experimental runtime UI stream normalizer", () => {
  test("wraps text deltas with AI SDK text lifecycle chunks", () => {
    const state = createExperimentalRuntimeUiStreamState()

    expect(
      normalizeExperimentalRuntimeUiChunk(state, {
        type: "text-delta",
        id: "text-1",
        delta: "hel",
      }),
    ).toEqual([
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "hel" },
    ])
    expect(
      normalizeExperimentalRuntimeUiChunk(state, {
        type: "text-delta",
        id: "text-1",
        delta: "lo",
      }),
    ).toEqual([{ type: "text-delta", id: "text-1", delta: "lo" }])
    expect(finalizeExperimentalRuntimeUiStream(state)).toEqual([
      { type: "text-end", id: "text-1" },
      { type: "finish" },
    ])
  })

  test("wraps reasoning deltas and closes reasoning before text", () => {
    const state = createExperimentalRuntimeUiStreamState()

    expect(
      normalizeExperimentalRuntimeUiChunk(state, {
        type: "reasoning-delta",
        id: "reasoning-1",
        delta: "think",
      }),
    ).toEqual([
      { type: "reasoning-start", id: "reasoning-1" },
      { type: "reasoning-delta", id: "reasoning-1", delta: "think" },
    ])
    expect(
      normalizeExperimentalRuntimeUiChunk(state, {
        type: "text-delta",
        id: "text-1",
        delta: "done",
      }),
    ).toEqual([
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "done" },
    ])
    expect(finalizeExperimentalRuntimeUiStream(state)).toEqual([
      { type: "reasoning-end", id: "reasoning-1" },
      { type: "text-end", id: "text-1" },
      { type: "finish" },
    ])
  })

  test("normalizes missing ids to stable fallback ids", () => {
    const state = createExperimentalRuntimeUiStreamState()

    expect(
      normalizeExperimentalRuntimeUiChunk(state, {
        type: "text-delta",
        id: null,
        delta: "hello",
      }),
    ).toEqual([
      { type: "text-start", id: "experimental-runtime-text" },
      {
        type: "text-delta",
        id: "experimental-runtime-text",
        delta: "hello",
      },
    ])
    expect(finalizeExperimentalRuntimeUiStream(state)).toEqual([
      { type: "text-end", id: "experimental-runtime-text" },
      { type: "finish" },
    ])
  })
})
