export type CodexAppServerFinishGateChunk = Record<string, unknown>

export type CodexAppServerFinishGate = {
  emit: (chunk: CodexAppServerFinishGateChunk) => void
  runWithDeferredFinish: <T>(
    run: () => Promise<T>,
    afterRun: (result: T) => void | Promise<void>,
  ) => Promise<T>
}

export function createCodexAppServerFinishGate(input: {
  enabled: () => boolean
  emit: (chunk: CodexAppServerFinishGateChunk) => void
}): CodexAppServerFinishGate {
  let deferring = false
  let deferredFinishChunk: CodexAppServerFinishGateChunk | null = null
  let finishReleased = false

  const releaseFinish = (chunk: CodexAppServerFinishGateChunk) => {
    if (finishReleased) return
    finishReleased = true
    input.emit(chunk)
  }

  const emit = (chunk: CodexAppServerFinishGateChunk) => {
    if (!input.enabled()) {
      input.emit(chunk)
      return
    }

    // App-server finish can arrive before route-owned message persistence.
    // Stream deltas still pass through immediately.
    if (chunk?.type === "finish") {
      if (deferring) {
        deferredFinishChunk = chunk
        return
      }
      releaseFinish(chunk)
      return
    }

    input.emit(chunk)
  }

  const finishDeferral = (releaseDeferred: boolean) => {
    deferring = false
    const chunk = deferredFinishChunk
    deferredFinishChunk = null
    if (releaseDeferred && chunk) {
      releaseFinish(chunk)
    }
  }

  const runWithDeferredFinish = async <T>(
    run: () => Promise<T>,
    afterRun: (result: T) => void | Promise<void>,
  ) => {
    if (!input.enabled()) {
      const result = await run()
      await afterRun(result)
      return result
    }

    deferring = true
    let releaseDeferred = false
    try {
      const result = await run()
      await afterRun(result)
      releaseDeferred = true
      return result
    } finally {
      finishDeferral(releaseDeferred)
    }
  }

  return {
    emit,
    runWithDeferredFinish,
  }
}
