// src/renderer/lib/atoms/remote-access.ts

import { atom } from "jotai"

export type RemoteAccessStatus =
  | { status: "disabled" }
  | { status: "downloading"; progress: number }
  | { status: "starting" }
  | { status: "active"; url: string; pin: string; clients: number }
  | { status: "error"; message: string }

export const remoteAccessStatusAtom = atom<RemoteAccessStatus>({ status: "disabled" })

export const remoteAccessDialogOpenAtom = atom(false)

// Connection state for remote mode (web client)
export type ConnectionState = "connecting" | "connected" | "disconnected"
export const remoteConnectionStateAtom = atom<ConnectionState>("connected")
