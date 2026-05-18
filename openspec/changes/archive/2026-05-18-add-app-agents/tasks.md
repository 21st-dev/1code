## 1. Specification
- [x] 1.1 Add App Agents OpenSpec delta.
- [x] 1.2 Validate the change with strict OpenSpec validation.

## 2. Backend
- [x] 2.1 Add `app_agents` database schema and migration.
- [x] 2.2 Add tRPC CRUD router for App Agents.
- [x] 2.3 Add shared prompt preparation helper for App Agent mentions.
- [x] 2.4 Use the helper in supported chat paths.

## 3. Renderer
- [x] 3.1 Replace the visible Agents settings tab with App Agents management.
- [x] 3.2 Source `@agent` dropdown and context recommendations from App Agents.
- [x] 3.3 Add bilingual UI strings.

## 4. Verification
- [x] 4.1 Run TypeScript, OpenSpec, i18n parity, diff whitespace, and build checks.

## 5. App Agent Registry
- [x] 5.1 Add curated App Agent registry listing and detail loading.
- [x] 5.2 Add registry import into local App Agents.
- [x] 5.3 Add App Agents registry browse UI and bilingual copy.
- [x] 5.4 Re-run validation after registry implementation.
- [x] 5.5 Make registry return and local delete actions visible.
