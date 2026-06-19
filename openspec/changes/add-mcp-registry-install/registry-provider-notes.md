# MCP Registry Provider Notes

Date: 2026-06-20

## Sources Checked

- Official registry README:
  `https://raw.githubusercontent.com/modelcontextprotocol/registry/main/README.md`
- Official live list endpoint:
  `https://registry.modelcontextprotocol.io/v0/servers`
- Official docs landing page:
  `https://registry.modelcontextprotocol.io/docs`

Local shell and Node network access are DNS-blocked in this sandbox, so provider
discovery was performed through the external web reader. The shell failures were:
`curl: (6) Could not resolve host` for both `registry.modelcontextprotocol.io`
and `api.github.com`.

## API Stability Signal

The official registry README says the registry API entered an API freeze for
`v0.1` on 2025-10-24, while development continues on `v0`. This is stable enough
to begin adapter discovery, but not enough by itself to skip concrete endpoint
shape recording.

## Confirmed List Shape

`GET https://registry.modelcontextprotocol.io/v0/servers` returns JSON with:

- `servers`: array
- `metadata.nextCursor`: opaque pagination cursor
- `metadata.count`: page count

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

## Not Yet Confirmed

The provider adapter cannot be implemented yet because task 0.3 requires the
concrete list, search, and detail API shape. This pass confirmed list shape and
entry fields, but did not produce reliable, citable evidence for:

- supported search query parameters or response shape
- supported detail endpoint path and response shape
- whether schema URLs such as
  `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`
  expose additional required fields not visible in the list response

Do not start registry normalization or UI implementation until these missing
provider facts are recorded or the OpenSpec provider decision is updated.

## Field Sufficiency Assessment

The confirmed list fields appear sufficient for a first pass at browse cards,
provenance display, setup-key display, transport preview, and redacted install
preview for entries that expose `remotes` or `packages`.

They are not yet sufficient to mark task 0.4 complete because search/detail and
schema field coverage are still unverified.
