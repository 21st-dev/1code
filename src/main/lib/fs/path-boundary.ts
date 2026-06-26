import { isAbsolute, relative, resolve } from "node:path"

export class PathBoundaryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PathBoundaryError"
  }
}

function containsNullByte(pathValue: string): boolean {
  return pathValue.includes("\0")
}

function containsTraversalSegment(pathValue: string): boolean {
  return pathValue.split(/[\\/]+/).includes("..")
}

export function isPathInsideOrEqual(
  rootPath: string,
  targetPath: string,
): boolean {
  const resolvedRoot = resolve(rootPath)
  const resolvedTarget = resolve(targetPath)
  const relativePath = relative(resolvedRoot, resolvedTarget)

  return (
    relativePath === "" ||
    (!!relativePath &&
      !relativePath.startsWith("..") &&
      !isAbsolute(relativePath))
  )
}

export function resolvePathWithinRoot(input: {
  targetPath: string
  rootPath: string
}): string {
  const { targetPath, rootPath } = input

  if (containsNullByte(targetPath) || containsNullByte(rootPath)) {
    throw new PathBoundaryError("Path contains invalid characters")
  }
  if (!isAbsolute(targetPath)) {
    throw new PathBoundaryError("Path must be absolute")
  }
  if (!isAbsolute(rootPath)) {
    throw new PathBoundaryError("Allowed root must be absolute")
  }
  if (
    containsTraversalSegment(targetPath) ||
    containsTraversalSegment(rootPath)
  ) {
    throw new PathBoundaryError("Path traversal not allowed")
  }

  const resolvedTarget = resolve(targetPath)
  const resolvedRoot = resolve(rootPath)

  if (!isPathInsideOrEqual(resolvedRoot, resolvedTarget)) {
    throw new PathBoundaryError("Path escapes allowed directory")
  }

  return resolvedTarget
}

export function assertRelativePathBoundary(pathValue: string): void {
  if (containsNullByte(pathValue)) {
    throw new PathBoundaryError("Path contains invalid characters")
  }
  if (isAbsolute(pathValue)) {
    throw new PathBoundaryError("Absolute paths are not allowed")
  }
  if (containsTraversalSegment(pathValue)) {
    throw new PathBoundaryError("Path traversal not allowed")
  }
}
