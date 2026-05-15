## 1. Registry Data Model
- [x] 1.1 Define the registry manifest TypeScript schema.
- [x] 1.2 Define installed-state storage for registry-managed skills.
- [x] 1.3 Decide bundled registry asset path and package format.

## 2. Main-Process Registry Service
- [x] 2.1 Add a main-process service to load bundled registry data.
- [x] 2.2 Add remote registry fetch/check support with HTTPS-only validation.
- [x] 2.3 Add SHA-256 verification for skill packages.
- [x] 2.4 Add safe install/update with backup and rollback.
- [x] 2.5 Detect locally modified registry-managed skills by comparing installed hash to current hash.

## 3. tRPC API
- [x] 3.1 Add registry list/check endpoints.
- [x] 3.2 Add install/update/rollback mutations.
- [x] 3.3 Ensure renderer input is validated and all filesystem writes stay in main process.

## 4. Settings UI
- [x] 4.1 Extend Skills settings with registry-managed status.
- [x] 4.2 Add Check Updates, Install, Update, Restore, and Rollback actions.
- [x] 4.3 Clearly distinguish User, Project, Plugin, and Registry sources.

## 5. Built-In Skill Pack
- [x] 5.1 Package the default general workflow skills.
- [x] 5.2 Package selected general technical skills.
- [x] 5.3 Exclude runtime-specific local-only skills such as Chronicle unless a compatible runtime exists.

## 6. Verification
- [x] 6.1 Verify a clean packaged-like profile can install bundled registry skills.
- [x] 6.2 Verify update check does not modify files.
- [x] 6.3 Verify update apply creates a backup and writes expected files.
- [x] 6.4 Verify hash mismatch blocks installation.
- [x] 6.5 Verify user-modified registry skills are not silently overwritten.
