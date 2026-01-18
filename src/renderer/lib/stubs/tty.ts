// Stub for Node.js tty module - used by commit-graph package
// This provides browser-compatible stubs for the tty functions

export function isatty(): boolean {
  return false
}

export default {
  isatty,
}
