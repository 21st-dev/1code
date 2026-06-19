# MCP Registry Provider Notes

Date: 2026-06-20

## Sources Checked

- Official registry README:
  `https://raw.githubusercontent.com/modelcontextprotocol/registry/main/README.md`
- Official live list endpoint:
  `https://registry.modelcontextprotocol.io/v0/servers`
- Official docs landing page:
  `https://registry.modelcontextprotocol.io/docs`
- Official registry API documentation:
  `https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md`
- Generic registry API documentation:
  `https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/generic-registry-api.md`
- Official OpenAPI source:
  `https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/openapi.yaml`
- Official API types and handlers:
  `https://github.com/modelcontextprotocol/registry/blob/main/pkg/api/v0/types.go`
  `https://github.com/modelcontextprotocol/registry/blob/main/internal/api/handlers/v0/servers.go`
  `https://github.com/modelcontextprotocol/registry/blob/main/internal/api/router/v0.go`
- Current server schema:
  `https://github.com/modelcontextprotocol/registry/blob/main/internal/validators/schemas/2025-12-11.json`
- Server JSON field documentation:
  `https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/generic-server-json.md`
  `https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/official-registry-requirements.md`

Local shell and Node network access are DNS-blocked in this sandbox, so provider
discovery was performed through the external web reader. The shell failures were:
`curl: (6) Could not resolve host` for both `registry.modelcontextprotocol.io`
and `api.github.com`.

## API Stability Signal

The official registry README says the registry API entered an API freeze for
`v0.1` on 2025-10-24, while development continues on `v0`. This is stable enough
to begin adapter discovery, but not enough by itself to skip concrete endpoint
shape recording.

## Confirmed Provider Adapter Shape

The documented official provider base URL is:

- production: `https://registry.modelcontextprotocol.io`
- staging: `https://staging.registry.modelcontextprotocol.io`

The documented stable API prefix is `v0.1`. The official router source also
registers equivalent `v0` routes, and the live web reader successfully opened
`GET https://registry.modelcontextprotocol.io/v0/servers`. Use `v0.1` for new
adapter code unless a runtime live check proves otherwise.

### List And Search

`GET /v0.1/servers` returns JSON with:

- `servers`: array
- `metadata.nextCursor`: opaque pagination cursor
- `metadata.count`: page count

Supported query parameters:

- `cursor`: opaque cursor from the prior response
- `limit`: 1-100, default 30 in the handler
- `search`: case-insensitive substring search on server names
- `updated_since`: RFC3339 timestamp for incremental sync
- `version`: `latest` or an exact version
- `include_deleted`: defaults false; automatically true with `updated_since`

Each item observed has:

- `server`: the MCP server manifest
- `_meta["io.modelcontextprotocol.registry/official"]`: registry-maintained
  publication/status metadata

Observed server manifest fields include:

- `$schema`
- `name`
- `title`
- `description`
- `version`
- `repository.url`
- `repository.source`
- `repository.id`
- `repository.subfolder`
- `websiteUrl`
- `icons`
- `remotes`
- `packages`
- `_meta`

Observed remote transport fields include:

- `type`: examples include `streamable-http` and `sse`
- `url`
- `headers[]`
- `headers[].name`
- `headers[].description`
- `headers[].isRequired`
- `headers[].isSecret`

Observed package fields include:

- `registryType`: examples include `npm` and `pypi`
- `identifier`
- `version`
- `transport.type`: observed `stdio`
- `environmentVariables[]` on some package entries

Observed official registry metadata fields include:

- `status`: examples include `active` and `deprecated`
- `statusChangedAt`
- `statusMessage`
- `publishedAt`
- `updatedAt`
- `isLatest`

### Detail

`GET /v0.1/servers/{serverName}/versions/{version}` returns a single
`ServerResponse`.

Path/query behavior:

- `serverName` is URL-encoded, for example `io.github.user%2Fmy-server`
- `version` is URL-encoded and may be a concrete version or `latest`
- `include_deleted` defaults false

`GET /v0.1/servers/{serverName}/versions` returns all versions for a server as a
`ServerListResponse`.

## Schema And Preview-Relevant Fields

The `2025-12-11` schema and Go model confirm fields needed by registry install
preview and normalization:

- top-level identity/provenance: `name`, `description`, `title`, `version`,
  `$schema`, `websiteUrl`, `repository.url`, `repository.source`,
  `repository.id`, `repository.subfolder`, `icons`
- packages: `registryType`, `registryBaseUrl`, `identifier`, `version`,
  `fileSha256`, `runtimeHint`, `transport`, `runtimeArguments`,
  `packageArguments`, `environmentVariables`
- local/package transports: `stdio`, `streamable-http`, `sse`
- remote transports: `streamable-http`, `sse`, `url`, `headers`, `variables`
- setup inputs: `name`, `description`, `isRequired`, `isSecret`, `format`,
  `value`, `default`, `placeholder`, `choices`, nested `variables`
- registry response metadata: `status`, `statusMessage`, `statusChangedAt`,
  `publishedAt`, `updatedAt`, `isLatest`
- publisher metadata: `server._meta["io.modelcontextprotocol.registry/publisher-provided"]`

The official registry requirements add useful provenance constraints:

- namespace ownership is verified for publishing
- package ownership is verified when publishing
- package base URLs are restricted to supported public registries
- only `server._meta["io.modelcontextprotocol.registry/publisher-provided"]` is
  preserved from publisher metadata

## Field Sufficiency Assessment

The official registry can supply the fields needed for registry normalization,
provenance, setup classification, redacted preview, and initial installability
analysis:

- browse/search: list endpoint with pagination and `search`
- detail: version detail endpoint plus `latest`
- provenance: repository metadata, registry metadata, publisher metadata,
  version, package registry identity, optional package hash
- setup: env/header/input metadata with required/secret/default/choices fields
- preview: package/remote transport, runtime/package args, URL/header templates

No provider decision change is required before implementation. Runtime adapter
installability and local verification still remain separate Phase-0 proof gates.
