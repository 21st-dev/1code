# Change: Optimize file viewer performance

## Why
File preview now uses Monaco for small files and a plain fallback for larger files. The fallback still renders every line at once, and the first Monaco load can pause the first small-file preview.

## What Changes
- Virtualize the plain large-file code fallback so large readable files do not mount every line at once.
- Preload the Monaco viewer opportunistically after users enter the file viewer path, without moving Monaco into the initial app bundle.
- Keep the existing Monaco size guardrail and add focused checks around the viewer selection thresholds.

## Impact
- Affected specs: file-viewer-performance
- Affected code: `src/renderer/features/file-viewer/components/*`, `tests/file-viewer-preview-limits.test.ts`
