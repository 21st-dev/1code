// src/main/lib/remote-access/session.ts

import { randomInt } from "crypto"

export interface RemoteSession {
  pin: string
  url: string | null
  createdAt: Date
  clients: Set<string> // client IDs
}

let currentSession: RemoteSession | null = null

/**
 * Generate a 6-digit PIN
 */
export function generatePin(): string {
  return randomInt(100000, 999999).toString()
}

/**
 * Start a new remote session
 */
export function createSession(): RemoteSession {
  currentSession = {
    pin: generatePin(),
    url: null,
    createdAt: new Date(),
    clients: new Set(),
  }
  return currentSession
}

/**
 * Get current session
 */
export function getSession(): RemoteSession | null {
  return currentSession
}

/**
 * Set tunnel URL after cloudflared starts
 */
export function setSessionUrl(url: string): void {
  if (currentSession) {
    currentSession.url = url
  }
}

/**
 * Validate PIN
 */
export function validatePin(pin: string): boolean {
  return currentSession?.pin === pin
}

/**
 * Add a connected client
 */
export function addClient(clientId: string): void {
  currentSession?.clients.add(clientId)
}

/**
 * Remove a connected client
 */
export function removeClient(clientId: string): void {
  currentSession?.clients.delete(clientId)
}

/**
 * Get connected client count
 */
export function getClientCount(): number {
  return currentSession?.clients.size ?? 0
}

/**
 * End current session
 */
export function endSession(): void {
  currentSession = null
}

/**
 * Check if session is active
 */
export function isSessionActive(): boolean {
  return currentSession !== null
}
