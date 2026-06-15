import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"
import {
  AGENT_JOB_MODES,
  AGENT_JOB_SOURCES,
  AGENT_JOB_STATUSES,
} from "../src/shared/agent-jobs"
import {
  AGENT_RUNTIME_CAPABILITY_IDS,
  AGENT_RUNTIME_IDS,
} from "../src/shared/agent-runtime-capabilities"
import {
  LOCAL_JOB_API_EVENT_TYPES,
  LOCAL_JOB_API_VERSION,
  LOCAL_JOB_API_WRITE_POLICIES,
} from "../src/shared/local-job-api"

type SchemaObject = {
  [key: string]: unknown
  $defs: Record<string, SchemaObject>
}

function loadSchema(): SchemaObject {
  return JSON.parse(
    readFileSync("docs/local-job-api-v1.schema.json", "utf8"),
  ) as SchemaObject
}

function def(schema: SchemaObject, name: string): SchemaObject {
  const value = schema.$defs[name]
  expect(value, `Missing schema def ${name}`).toBeDefined()
  return value
}

function schemaEnum(schema: SchemaObject): string[] {
  const value = schema.enum
  expect(Array.isArray(value)).toBe(true)
  return value as string[]
}

describe("Local Job API v1 JSON Schema", () => {
  test("keeps schema constants in sync with shared Local Job API constants", () => {
    const schema = loadSchema()

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
    expect(def(schema, "apiVersion").const).toBe(LOCAL_JOB_API_VERSION)
    expect(schemaEnum(def(schema, "runtimeId"))).toEqual([
      ...AGENT_RUNTIME_IDS,
    ])
    expect(schemaEnum(def(schema, "runtimeIdInput"))).toEqual([
      ...AGENT_RUNTIME_IDS,
      "claude",
    ])
    expect(schemaEnum(def(schema, "runtimeCapabilityId"))).toEqual([
      ...AGENT_RUNTIME_CAPABILITY_IDS,
    ])
    expect(schemaEnum(def(schema, "agentMode"))).toEqual([
      ...AGENT_JOB_MODES,
    ])
    expect(schemaEnum(def(schema, "agentJobStatus"))).toEqual([
      ...AGENT_JOB_STATUSES,
    ])
    expect(schemaEnum(def(schema, "writePolicy"))).toEqual([
      ...LOCAL_JOB_API_WRITE_POLICIES,
    ])
    expect(schemaEnum(def(schema, "eventType"))).toEqual([
      ...LOCAL_JOB_API_EVENT_TYPES,
    ])
  })

  test("documents create request normalization and runtime-only validation rules", () => {
    const createRequest = def(loadSchema(), "createRequest")
    const properties = createRequest.properties as Record<string, SchemaObject>
    const prompt = properties.prompt.properties as Record<string, SchemaObject>
    const promptText = prompt.text as SchemaObject
    const artifacts = properties.artifacts as SchemaObject
    const artifactObject = (artifacts.oneOf as SchemaObject[])[0]
    const artifactProperties = artifactObject.properties as Record<
      string,
      SchemaObject
    >

    expect(createRequest.required).toEqual([
      "apiVersion",
      "consumer",
      "project",
      "runtime",
      "mode",
      "prompt",
    ])
    expect(promptText.maxLength).toBe(256 * 1024)
    expect(artifactProperties.writePolicy.default).toBe("metadata-only")
    expect(createRequest.description).toContain("secret-like")
    expect(createRequest.description).toContain("1 MiB")
    expect((properties.input as SchemaObject).description).toContain(
      "Provider credentials",
    )
  })

  test("keeps output envelopes tied to stable v1 envelope definitions", () => {
    const schema = loadSchema()
    const serializedJob = def(schema, "serializedAgentJob")
    const serializedJobProperties = serializedJob.properties as Record<
      string,
      SchemaObject
    >
    const eventEnvelope = def(schema, "eventEnvelope")
    const eventProperties = eventEnvelope.properties as Record<
      string,
      SchemaObject
    >
    const resultEnvelope = def(schema, "resultEnvelope")
    const resultProperties = resultEnvelope.properties as Record<
      string,
      SchemaObject
    >
    const createResponse = def(schema, "createResponseEnvelope")
    const createProperties = createResponse.properties as Record<
      string,
      SchemaObject
    >

    expect(schemaEnum(serializedJobProperties.source)).toEqual([
      ...AGENT_JOB_SOURCES,
    ])
    expect(eventProperties.type.$ref).toBe("#/$defs/eventType")
    expect((resultProperties.artifacts as SchemaObject).items).toEqual({
      $ref: "#/$defs/artifact",
    })
    expect((resultProperties.diagnostics as SchemaObject).items).toEqual({
      $ref: "#/$defs/diagnostic",
    })
    expect(createProperties.job).toEqual({
      $ref: "#/$defs/serializedAgentJob",
    })
    expect(createProperties.result).toEqual({
      $ref: "#/$defs/resultEnvelope",
    })
  })
})
