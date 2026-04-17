export type BannerUpdateState = {
  status: "idle" | "checking" | "available" | "downloading" | "ready" | "error"
  version?: string
  progress?: number
}

export type UpdateBannerViewModel =
  | { kind: "hidden" }
  | { kind: "just-updated"; version: string | null }
  | { kind: "available"; title: string; message: string; actionLabel: string }
  | { kind: "progress"; title: string; message: string; progress?: number }
  | {
      kind: "restart-ready"
      version: string | null
      title: string
      message: string
      actionLabel: string
    }

export function getUpdateBannerViewModel({
  state,
  isPending,
  justUpdated,
  displayVersion,
}: {
  state: BannerUpdateState
  isPending: boolean
  justUpdated: boolean
  displayVersion: string | null
}): UpdateBannerViewModel {
  if (justUpdated) {
    return {
      kind: "just-updated",
      version: displayVersion,
    }
  }

  if (
    state.status === "idle" ||
    state.status === "checking" ||
    state.status === "error"
  ) {
    return { kind: "hidden" }
  }

  if (state.status === "available" && !isPending) {
    return {
      kind: "available",
      title: "Update available",
      message: "A new OpenCodex desktop build is ready to download.",
      actionLabel: "Update",
    }
  }

  if (state.status === "ready") {
    const version = state.version ?? displayVersion
    return {
      kind: "restart-ready",
      version,
      title: "Update ready",
      message: version
        ? `Restart OpenCodex to finish installing v${version}.`
        : "Restart OpenCodex to finish installing the downloaded update.",
      actionLabel: "Restart now",
    }
  }

  return {
    kind: "progress",
    title: isPending ? "Starting update" : "Downloading update",
    message: isPending
      ? "OpenCodex is preparing the update download."
      : "OpenCodex is downloading the update package.",
    progress: isPending ? undefined : state.progress,
  }
}
