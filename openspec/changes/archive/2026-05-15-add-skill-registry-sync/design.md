# Skill Registry Synchronization Design

## Context
Agent Code for Me currently scans skills from filesystem locations:
- user skills: `~/.claude/skills`
- project skills: `<project>/.claude/skills`
- plugin skills: enabled plugin component paths

This works for manually managed skills, but it does not answer how a packaged app should provide and update a default skill catalog. A packaged app should synchronize with a versioned data source, not with another local agent's private config directory.

## Goals
- Provide a product-ready source model for reusable global skills.
- Ship a default skill catalog with the app.
- Allow safe update checks from a versioned remote registry later.
- Preserve user and project skills.
- Make registry-managed skills auditable, reversible, and non-silent.

## Non-Goals
- Do not auto-install arbitrary third-party skills in the background.
- Do not make `~/.codex/skills` a packaged-app dependency.
- Do not execute registry-provided scripts during install or update.
- Do not replace project-level `.claude/skills` semantics.

## Data Source Model
Use a layered source model:

1. **Bundled Registry**
   - Ships with the app.
   - Provides the default skill catalog for offline/new installs.
   - Lives in packaged resources, for example `resources/skill-registry/`.

2. **Remote Registry**
   - A versioned manifest available over HTTPS.
   - Can be hosted on the app CDN or a dedicated GitHub release asset.
   - Used only for update checks and explicit user-approved updates.

3. **Manual/User Skills**
   - Existing `~/.claude/skills` content.
   - User-created skills remain editable and are never silently overwritten.

4. **Project Skills**
   - Existing `<project>/.claude/skills` content.
   - Project-owned and not managed by the global registry.

## Manifest Shape
The registry manifest should be explicit and machine-verifiable:

```json
{
  "schemaVersion": 1,
  "registryId": "agent-code-for-me-core-skills",
  "generatedAt": "2026-05-15T00:00:00Z",
  "skills": [
    {
      "id": "react-best-practices",
      "displayName": "React Best Practices",
      "version": "1.0.0",
      "description": "React and Next.js performance guidance.",
      "source": "https://example.com/skills/react-best-practices-1.0.0.tgz",
      "sha256": "hex-encoded-content-hash",
      "compatibility": {
        "minAppVersion": "0.0.0",
        "runtimes": ["claude"]
      },
      "license": "MIT"
    }
  ]
}
```

For bundled registry data, `source` can refer to a local packaged asset path instead of an HTTPS URL.

## Installed State
Track registry-managed installs separately from the skill files. Recommended state location:

```text
~/.claude/skill-registry-state.json
```

State should record:
- skill id
- installed version
- registry id
- content hash
- install path
- installed at
- last checked at
- whether the user modified the installed files after install

This avoids confusing registry-managed skills with user-created skills.

## Install and Update Flow
1. Load bundled registry manifest.
2. Optionally fetch remote registry manifest.
3. Compare registry versions/hashes with installed state.
4. Show available installs/updates in Settings > Skills.
5. On user approval:
   - Download or read the skill package.
   - Verify SHA-256 hash.
   - Validate package layout: `<skill>/SKILL.md` and allowed support files.
   - Back up existing target directory.
   - Write to `~/.claude/skills/<skill-id>/`.
   - Update installed state.
6. Provide rollback from the latest backup if install fails or user requests it.

## Security Rules
- HTTPS required for remote registries outside development mode.
- Hash verification required before install.
- Optional signature verification should be added before enabling third-party registries.
- No post-install scripts.
- No shell execution from registry packages.
- No silent overwrite of user-modified skills.
- Renderer can request registry actions via tRPC, but filesystem writes happen in the main process.
- Error messages must not leak local paths beyond what is useful for debugging.

## UI Model
Extend the existing Skills settings surface:
- Source labels: User, Project, Plugin, Registry.
- Registry status: Installed, Update available, Not installed, Modified locally.
- Actions: Install, Update, Restore bundled version, Roll back.
- A manual Check Updates button.

Default behavior should be check-only, not auto-apply.

## Migration Notes
The temporary local Codex-to-Claude sync script can remain a developer utility, but it is not the packaged product model. If retained, it should be documented as local bootstrap only.

## Open Questions
- Should the first remote registry live on a fork-owned update feed or a separate GitHub release asset?
- Should registry-managed skills be editable in the existing Skill editor, or should edits first fork them into user-owned skills?
- Should third-party registries be allowed in the first release, or only the official bundled/remote registry?
