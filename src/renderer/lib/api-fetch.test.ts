import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { getApiBaseUrl } from "./api-fetch"

describe("getApiBaseUrl", () => {
  const originalWindow = globalThis.window

  beforeEach(() => {
    mock.restore()
  })

  afterEach(() => {
    globalThis.window = originalWindow
  })

  test("reads the desktop-owned api base url once and caches it", async () => {
    const getApiBaseUrlMock = mock(async () => "https://desktop.opencodex.example")
    globalThis.window = {
      desktopApi: {
        getApiBaseUrl: getApiBaseUrlMock,
      },
    } as any

    await expect(getApiBaseUrl()).resolves.toBe("https://desktop.opencodex.example")
    await expect(getApiBaseUrl()).resolves.toBe("https://desktop.opencodex.example")
    expect(getApiBaseUrlMock).toHaveBeenCalledTimes(1)
  })
})
