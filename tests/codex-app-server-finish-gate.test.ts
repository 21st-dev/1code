import { describe, expect, mock, test } from "bun:test"
import { createCodexAppServerFinishGate } from "../src/main/lib/codex/app-server-finish-gate"

describe("Codex app-server finish gate", () => {
  test("releases renderer finish only after post-run persistence completes", async () => {
    const events: string[] = []
    const rendererChunks: Record<string, unknown>[] = []
    const persistSubChatMessages = mock(() => {
      events.push("persist")
    })
    const gate = createCodexAppServerFinishGate({
      enabled: () => true,
      emit: (chunk) => {
        events.push(`emit:${chunk.type}`)
        rendererChunks.push(chunk)
      },
    })
    const fakeAdapter = mock(async () => {
      gate.emit({ type: "text-delta", delta: "final answer" })
      gate.emit({ type: "finish", status: "succeeded" })
      return { status: "succeeded" as const }
    })

    await gate.runWithDeferredFinish(fakeAdapter, () => {
      persistSubChatMessages()
    })

    expect(fakeAdapter).toHaveBeenCalledTimes(1)
    expect(persistSubChatMessages).toHaveBeenCalledTimes(1)
    expect(events).toEqual([
      "emit:text-delta",
      "persist",
      "emit:finish",
    ])
    expect(rendererChunks.map((chunk) => chunk.type)).toEqual([
      "text-delta",
      "finish",
    ])
  })

  test("lets non-app-server finish chunks pass through immediately", async () => {
    const events: string[] = []
    const gate = createCodexAppServerFinishGate({
      enabled: () => false,
      emit: (chunk) => {
        events.push(`emit:${chunk.type}`)
      },
    })

    await gate.runWithDeferredFinish(
      async () => {
        gate.emit({ type: "finish" })
        return { status: "succeeded" as const }
      },
      () => {
        events.push("after-run")
      },
    )

    expect(events).toEqual(["emit:finish", "after-run"])
  })

  test("drops a deferred adapter finish when the adapter rejects", async () => {
    const events: string[] = []
    const gate = createCodexAppServerFinishGate({
      enabled: () => true,
      emit: (chunk) => {
        events.push(`emit:${chunk.type}`)
      },
    })
    const runError = new Error("adapter failed")

    await expect(
      gate.runWithDeferredFinish(
        async () => {
          gate.emit({ type: "finish" })
          throw runError
        },
        () => {
          events.push("after-run")
        },
      ),
    ).rejects.toThrow("adapter failed")

    gate.emit({ type: "error", errorText: "adapter failed" })
    gate.emit({ type: "finish" })

    expect(events).toEqual(["emit:error", "emit:finish"])
  })

  test("does not swallow caller-emitted error finish after rejection", async () => {
    const events: string[] = []
    const gate = createCodexAppServerFinishGate({
      enabled: () => true,
      emit: (chunk) => {
        events.push(`emit:${chunk.type}`)
      },
    })

    await expect(
      gate.runWithDeferredFinish(
        async () => {
          throw new Error("adapter failed")
        },
        () => {
          events.push("after-run")
        },
      ),
    ).rejects.toThrow("adapter failed")

    gate.emit({ type: "error", errorText: "adapter failed" })
    gate.emit({ type: "finish" })

    expect(events).toEqual(["emit:error", "emit:finish"])
  })

  test("does not double emit finish when persistence fails after adapter finish", async () => {
    const events: string[] = []
    const gate = createCodexAppServerFinishGate({
      enabled: () => true,
      emit: (chunk) => {
        events.push(`emit:${chunk.type}`)
      },
    })

    await expect(
      gate.runWithDeferredFinish(
        async () => {
          gate.emit({ type: "finish", status: "succeeded" })
          return { status: "succeeded" as const }
        },
        () => {
          throw new Error("database is locked")
        },
      ),
    ).rejects.toThrow("database is locked")

    gate.emit({ type: "error", errorText: "database is locked" })
    gate.emit({ type: "finish" })
    gate.emit({ type: "finish" })

    expect(events).toEqual(["emit:error", "emit:finish"])
  })

  test("emits a successful deferred finish only once", async () => {
    const events: string[] = []
    const gate = createCodexAppServerFinishGate({
      enabled: () => true,
      emit: (chunk) => {
        events.push(`emit:${chunk.type}`)
      },
    })

    await gate.runWithDeferredFinish(
      async () => {
        gate.emit({ type: "finish" })
        return { status: "succeeded" as const }
      },
      () => undefined,
    )
    gate.emit({ type: "finish" })

    expect(events).toEqual(["emit:finish"])
  })
})
