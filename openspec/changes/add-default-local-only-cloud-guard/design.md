## Context
The desktop app is local-first, but some inherited hosted features still use `21st.dev`, `1code.dev`, the release CDN, or remote sandbox endpoints from renderer and main process code. UI-only removal is insufficient because `signedFetch` and `streamFetch` are general-purpose main-process network proxies.

## Goals / Non-Goals
- Goals: default to local-only; centralize hosted URL detection; block official cloud calls in main-process security boundaries; hide renderer entrypoints that would trigger hosted calls.
- Goals: keep user-owned external services working, including configured Anthropic/OpenAI/DeepSeek-compatible providers, Ollama, Git remotes, and GitHub links/actions.
- Non-Goals: build a visible product settings toggle, remove hosted code permanently, or create a strict offline firewall for every external network request.

## Decisions
- Decision: Local-only defaults to enabled unless `ONECODE_LOCAL_ONLY=false` or `MAIN_VITE_LOCAL_ONLY=false`.
- Decision: The main-process guard is authoritative. Renderer checks are for UX and avoiding unnecessary requests, not the security boundary.
- Decision: `window.desktopApi.getApiBaseUrl()` returns `null` in local-only mode so renderer clients cannot silently fall back to hosted production.
- Decision: Official cloud URLs include `21st.dev`, `*.21st.dev`, `1code.dev`, `*.1code.dev`, `cdn.21st.dev`, and hosted sandbox preview/import domains used by 1Code.

## Risks / Trade-offs
- Existing users with authenticated hosted sessions will keep local credentials on disk, but local-only mode will not refresh or use them.
- Some remote/sandbox UI state may be persisted locally; startup should coerce selection back to local mode instead of trying to load remote data.
- Build-time Electron metadata may still include homepage/publish URLs, but runtime checks must not contact them while local-only mode is enabled.
