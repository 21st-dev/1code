import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { join } from "node:path"

const originalConsoleLog = console.log
const originalConsoleError = console.error
const originalOpenAIApiKey = process.env.OPENAI_API_KEY

mock.module("electron", () => ({
  app: {
    isPackaged: false,
    getPath() {
      return "/tmp/locus-voice-transcription-unused"
    },
  },
  safeStorage: {
    isEncryptionAvailable() {
      return true
    },
    encryptString(value: string) {
      return Buffer.from(`encrypted:${value}`, "utf-8")
    },
    decryptString(value: Buffer) {
      const raw = value.toString("utf-8")
      return raw.startsWith("encrypted:") ? raw.slice("encrypted:".length) : ""
    },
  },
  shell: {
    openExternal() {
      return Promise.resolve()
    },
  },
}))

const { buildTranscriptionUrl, transcribeWithProviderConfig } = await import(
  "../src/main/lib/trpc/routers/voice"
)

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function createTranscriptionServer(handler: (params: {
  req: IncomingMessage
  res: ServerResponse
  body: string
}) => void | Promise<void>) {
  const server = createServer((req, res) => {
    void readBody(req)
      .then((body) => handler({ req, res, body }))
      .catch((error) => {
        res.writeHead(500, { "content-type": "text/plain" })
        res.end(String(error))
      })
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    throw new Error("failed to start transcription server")
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe("voice transcription provider config", () => {
  beforeEach(() => {
    console.log = mock(() => {}) as typeof console.log
    console.error = mock(() => {}) as typeof console.error
    process.env.OPENAI_API_KEY = "sk-env-should-not-be-used"
  })

  afterEach(() => {
    console.log = originalConsoleLog
    console.error = originalConsoleError
    if (originalOpenAIApiKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIApiKey
    }
  })

  test("builds transcription URLs from base URLs or full endpoint URLs", () => {
    expect(buildTranscriptionUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1/audio/transcriptions",
    )
    expect(
      buildTranscriptionUrl(
        "https://api.example.com/v1/audio/transcriptions?leak=1#frag",
      ),
    ).toBe("https://api.example.com/v1/audio/transcriptions")
    expect(() => buildTranscriptionUrl("file:///tmp/provider")).toThrow(/HTTP/)
    expect(() =>
      buildTranscriptionUrl("https://user:pass@api.example.com/v1"),
    ).toThrow(/credentials/)
  })

  test("posts audio to the encrypted stored voice transcription provider", async () => {
    const requests: Array<{
      url: string | undefined
      authorization: string | undefined
      body: string
    }> = []
    const server = await createTranscriptionServer(({ req, res, body }) => {
      requests.push({
        url: req.url,
        authorization: req.headers.authorization,
        body,
      })
      res.writeHead(200, { "content-type": "text/plain" })
      res.end(" hello\u200B   world\n")
    })

    try {
      const text = await transcribeWithProviderConfig(
        Buffer.from("sample audio"),
        "webm",
        {
          purpose: "voice_transcription",
          model: "whisper-compatible-model",
          baseUrl: server.baseUrl,
          token: "sk-stored-voice-token",
          source: "stored",
        },
        "en",
      )

      expect(text).toBe("hello world")
      expect(requests).toHaveLength(1)
      expect(requests[0]?.url).toBe("/v1/audio/transcriptions")
      expect(requests[0]?.authorization).toBe("Bearer sk-stored-voice-token")
      expect(requests[0]?.body).toContain('name="model"')
      expect(requests[0]?.body).toContain("whisper-compatible-model")
      expect(requests[0]?.body).toContain('name="language"')
      expect(requests[0]?.body).toContain("en")
    } finally {
      await server.close()
    }
  })

  test("does not contain the legacy environment or shell fallback", () => {
    const voiceSource = readFileSync(
      join(process.cwd(), "src/main/lib/trpc/routers/voice.ts"),
      "utf-8",
    )

    expect(voiceSource).not.toContain("MAIN_VITE_OPENAI_API_KEY")
    expect(voiceSource).not.toContain("OPENAI_API_KEY")
    expect(voiceSource).not.toContain("execSync")
    expect(voiceSource).not.toContain("setOpenAIKey")
    expect(voiceSource).not.toContain("hasOpenAIKey")
  })

  test("rejects invalid audio and language inputs before network calls", async () => {
    const server = await createTranscriptionServer(({ res }) => {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("unexpected")
    })

    try {
      await expect(
        transcribeWithProviderConfig(
          Buffer.alloc(25 * 1024 * 1024 + 1),
          "webm",
          {
            purpose: "voice_transcription",
            model: "whisper-compatible-model",
            baseUrl: server.baseUrl,
            token: "sk-stored-voice-token",
            source: "stored",
          },
        ),
      ).rejects.toThrow(/Audio too large/)
    } finally {
      await server.close()
    }
  })

  test("does not log provider error bodies or transcript text", async () => {
    const server = await createTranscriptionServer(({ res }) => {
      res.writeHead(500, { "content-type": "text/plain" })
      res.end("provider-body-secret")
    })

    try {
      await expect(
        transcribeWithProviderConfig(
          Buffer.from("sample audio"),
          "webm",
          {
            purpose: "voice_transcription",
            model: "whisper-compatible-model",
            baseUrl: server.baseUrl,
            token: "sk-stored-voice-token",
            source: "stored",
          },
        ),
      ).rejects.toThrow(/temporarily unavailable/)

      const loggedOutput = [
        JSON.stringify(
          (console.log as unknown as { mock: { calls: unknown[] } }).mock.calls,
        ),
        JSON.stringify(
          (console.error as unknown as { mock: { calls: unknown[] } }).mock.calls,
        ),
      ].join("\n")

      expect(loggedOutput).not.toContain("provider-body-secret")
      expect(loggedOutput).not.toContain("hello world")
      expect(loggedOutput).not.toContain("sk-stored-voice-token")
    } finally {
      await server.close()
    }
  })
})
