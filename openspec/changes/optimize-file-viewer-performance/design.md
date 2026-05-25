## Context
The file viewer has two rendering paths: Monaco for small code previews and a plain code block fallback for larger readable files. The backend already caps `readTextFile` at 2 MB, while the Monaco path is capped at 512 KB.

## Goals
- Preserve the small-file Monaco experience.
- Reduce DOM work for larger plain text/code fallbacks.
- Reduce first-use Monaco latency without increasing initial app startup cost.

## Non-Goals
- Do not replace chat code blocks or diff rendering with Monaco.
- Do not raise the backend 2 MB file read limit.
- Do not add new package dependencies.

## Decisions
- Use the existing `@tanstack/react-virtual` dependency for the plain fallback.
- Keep virtualization inside the fallback component so callers only choose Monaco vs plain preview.
- Export a preload helper from the Monaco lazy module boundary and invoke it only from file-viewer entry points.
- Keep unit tests focused on deterministic threshold/selection behavior; manual performance validation remains an Electron runtime check.
