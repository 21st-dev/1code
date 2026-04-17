import { describe, expect, test } from "bun:test"
import { getUpdateBannerViewModel } from "./banner-model"

describe("getUpdateBannerViewModel", () => {
  test("returns explicit restart-ready state after download completes", () => {
    const viewModel = getUpdateBannerViewModel({
      state: {
        status: "ready",
        version: "1.2.4",
      },
      isPending: false,
      justUpdated: false,
      displayVersion: "1.2.4",
    })

    expect(viewModel).toEqual({
      kind: "restart-ready",
      version: "1.2.4",
      title: "Update ready",
      message: "Restart OpenCodex to finish installing v1.2.4.",
      actionLabel: "Restart now",
    })
  })

  test("shows download progress instead of restart copy while update is still downloading", () => {
    const viewModel = getUpdateBannerViewModel({
      state: {
        status: "downloading",
        progress: 42,
      },
      isPending: false,
      justUpdated: false,
      displayVersion: null,
    })

    expect(viewModel).toEqual({
      kind: "progress",
      title: "Downloading update",
      message: "OpenCodex is downloading the update package.",
      progress: 42,
    })
  })

  test("prioritizes the just-updated banner over live update states", () => {
    const viewModel = getUpdateBannerViewModel({
      state: {
        status: "available",
        version: "1.2.5",
      },
      isPending: false,
      justUpdated: true,
      displayVersion: "1.2.4",
    })

    expect(viewModel).toEqual({
      kind: "just-updated",
      version: "1.2.4",
    })
  })
})
