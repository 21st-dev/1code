import * as electron from "electron"
import type { ClaudeAgentSdkFileChangeNotification } from "./agent-sdk-chunk-processor"

export type ClaudeAgentSdkFileChangeWindow = {
  webContents: {
    send(channel: string, payload: ClaudeAgentSdkFileChangeNotification): void
  }
}

export function notifyClaudeAgentSdkFileChanged(
  event: ClaudeAgentSdkFileChangeNotification,
  getWindows: () => ClaudeAgentSdkFileChangeWindow[] = () =>
    (
      electron as unknown as {
        BrowserWindow: { getAllWindows(): ClaudeAgentSdkFileChangeWindow[] }
      }
    ).BrowserWindow.getAllWindows(),
): void {
  const windows = getWindows()
  for (const win of windows) {
    win.webContents.send("file-changed", event)
  }
}
