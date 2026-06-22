## 1. Specification
- [ ] 1.1 Update `command-guide` requirements so Commands owns local command file CRUD.
- [ ] 1.2 Update `settings-information-architecture` requirements so command management is not duplicated in Skills.
- [ ] 1.3 Validate the OpenSpec change.

## 2. Implementation
- [ ] 2.1 Add local command create/edit/delete UI to Settings > Commands.
- [ ] 2.2 Keep official command index, runtime CLI detection, and plugin command sections read-only.
- [ ] 2.3 Remove the Commands sub-view, command item model, and command mutations from Settings > Skills.
- [ ] 2.4 Rename page-level Command Guide copy to Commands in English and Chinese dictionaries.

## 3. Verification
- [ ] 3.1 Add or update a guard proving Skills no longer wires command CRUD/list procedures.
- [ ] 3.2 Run targeted tests and TypeScript checks.
- [ ] 3.3 Run `openspec validate --all --strict --no-interactive`.
