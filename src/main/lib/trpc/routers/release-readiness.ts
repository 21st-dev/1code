import path from "node:path"
import { promises as fs } from "node:fs"
import { z } from "zod"
import { publicProcedure, router } from "../index"

type GateStatus = "passed" | "pending" | "blocked" | "missing" | "failed"

type ReleaseReport = {
  status?: string
  generatedAt?: string
  scripts?: {
    build?: string
    packageMac?: string
    distManifest?: string
    distUpload?: string
    distUploadDryRun?: string
    releaseNotarize?: string
    releaseEvidenceAudit?: string
  }
  mac?: {
    targets?: Array<{
      target?: string
      arch?: string[]
    }>
    hardenedRuntime?: boolean
    entitlements?: string
    entitlementsInherit?: string
    publish?: {
      provider?: string
      url?: string
    }
  }
  signing?: {
    appleIdentityEnv?: string
    electronBuilderIdentity?: string
    notarizationMode?: string
    electronBuilderNotarize?: boolean
    releaseWorkflow?: {
      workflowPath?: string
      present?: boolean
      uploadsEvidence?: boolean
    }
    credentialPreflight?: {
      report?: string
      status?: string
      credentialsComplete?: boolean
      missingCredentials?: string[]
      toolsComplete?: boolean
      missingTools?: string[]
      blockers?: string[]
    } | null
    evidenceAudit?: {
      report?: string
      status?: string
      requireNotarization?: boolean
      distributable?: boolean
      blockerCount?: number
      validNotarizationReports?: string[]
      acceptedSubmissions?: number
    } | null
    validNotarizationReports?: string[]
  }
  artifacts?: {
    releaseDir?: string
    files?: string[]
    macArtifacts?: string[]
    updateManifests?: string[]
    notarizationEvidence?: string[]
  }
  distribution?: {
    uploadScript?: string
    uploadPlan?: {
      manifest?: string
      status?: string
      dryRun?: boolean
      provider?: string
      channel?: string
      artifactCount?: number
      target?: {
        baseUrl?: string
        uploadPrefix?: string
      }
    } | null
  }
  warnings?: string[]
  failures?: string[]
}

const releaseLatestRelativePath = path.join(
  ".1code",
  "program",
  "release-packaging",
  "latest.json",
)

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function listReleaseFiles(rootPath: string) {
  const releaseDir = path.join(rootPath, "release")
  try {
    const entries = await fs.readdir(releaseDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join("release", entry.name).split(path.sep).join("/"))
      .sort()
  } catch {
    return []
  }
}

function normalizeRootPath(projectPath?: string) {
  if (projectPath && path.isAbsolute(projectPath)) return projectPath
  return process.cwd()
}

async function resolveReleaseRootPath(projectPath?: string) {
  const candidateRootPath = normalizeRootPath(projectPath)
  const cwdRootPath = process.cwd()
  if (candidateRootPath === cwdRootPath) return candidateRootPath

  if (await exists(path.join(candidateRootPath, releaseLatestRelativePath))) {
    return candidateRootPath
  }

  if (await exists(path.join(cwdRootPath, releaseLatestRelativePath))) {
    return cwdRootPath
  }

  return candidateRootPath
}

function gate(
  id: string,
  title: string,
  status: GateStatus,
  detail: string,
  command: string,
  evidence?: string | null,
) {
  return {
    id,
    title,
    status,
    detail,
    command,
    evidence: evidence ?? null,
  }
}

export const releaseReadinessRouter = router({
  snapshot: publicProcedure
    .input(
      z
        .object({
          projectPath: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const rootPath = await resolveReleaseRootPath(input?.projectPath)
      const latestPath = path.join(rootPath, releaseLatestRelativePath)
      const latest = await readJson<{
        report?: string
        generatedAt?: string
        status?: string
      }>(latestPath)
      const reportPath = latest?.report
        ? path.join(rootPath, latest.report)
        : path.join(
            rootPath,
            ".1code",
            "program",
            "release-packaging",
            "report.json",
          )
      const report = await readJson<ReleaseReport>(reportPath)
      const releaseFiles = await listReleaseFiles(rootPath)
      const reportArtifacts = report?.artifacts ?? {}
      const macArtifacts =
        reportArtifacts.macArtifacts?.length
          ? reportArtifacts.macArtifacts
          : releaseFiles.filter((filePath) => /\.(dmg|zip)$/i.test(filePath))
      const updateManifests =
        reportArtifacts.updateManifests?.length
          ? reportArtifacts.updateManifests
          : releaseFiles.filter((filePath) =>
              /(?:latest|beta)-mac(?:-x64)?\.yml$/.test(path.basename(filePath)),
            )
      const notarizationEvidence =
        reportArtifacts.notarizationEvidence?.length
          ? reportArtifacts.notarizationEvidence
          : releaseFiles.filter((filePath) =>
              /notary|notar|codesign|staple|spctl/i.test(path.basename(filePath)),
            )
      const validNotarizationReports =
        report?.signing?.validNotarizationReports ?? []
      const credentialPreflight = report?.signing?.credentialPreflight ?? null
      const evidenceAudit = report?.signing?.evidenceAudit ?? null
      const uploadPlan = report?.distribution?.uploadPlan ?? null
      const migrationEvidenceCandidates = [
        ".1code/program/migration-data-loss/latest.json",
        ".1code/program/migration/latest.json",
        ".1code/program/data-loss/latest.json",
      ]
      const migrationEvidence = (
        await Promise.all(
          migrationEvidenceCandidates.map(async (candidate) => ({
            candidate,
            present: await exists(path.join(rootPath, candidate)),
          })),
        )
      ).find((candidate) => candidate.present)?.candidate

      const preflightStatus: GateStatus = report
        ? report.status === "passed"
          ? "passed"
          : "failed"
        : "missing"
      const artifactsStatus: GateStatus =
        macArtifacts.length > 0 && updateManifests.length > 0 ? "passed" : "pending"
      const signingStatus: GateStatus =
        report?.signing?.appleIdentityEnv === "set" ? "passed" : "pending"
      const credentialPreflightStatus: GateStatus =
        credentialPreflight?.status === "passed"
          ? "passed"
          : credentialPreflight?.status === "blocked"
            ? "blocked"
            : credentialPreflight?.status === "failed"
              ? "failed"
              : report
                ? "pending"
                : "missing"
      const releaseWorkflowStatus: GateStatus =
        report?.signing?.releaseWorkflow?.present && report.signing.releaseWorkflow.uploadsEvidence
          ? "passed"
          : report
            ? "pending"
            : "missing"
      const uploadPlanStatus: GateStatus =
        uploadPlan?.status === "passed" && uploadPlan.dryRun && (uploadPlan.artifactCount ?? 0) >= 6
          ? "passed"
          : report
            ? "pending"
            : "missing"
      const notarizationStatus: GateStatus =
        validNotarizationReports.length > 0 ? "passed" : "pending"
      const evidenceAuditStatus: GateStatus =
        evidenceAudit?.status === "passed" && evidenceAudit.distributable
          ? "passed"
          : evidenceAudit?.status === "blocked"
            ? "blocked"
            : evidenceAudit?.status === "failed"
              ? "failed"
              : report
                ? "pending"
                : "missing"
      const migrationStatus: GateStatus = migrationEvidence ? "passed" : "pending"

      const gates = [
        gate(
          "preflight",
          "Preflight",
          preflightStatus,
          report
            ? "Packaging configuration report is available."
            : "No release packaging preflight report found.",
          "bun run verify:packaging",
          latest?.report,
        ),
        gate(
          "artifacts",
          "Artifacts",
          artifactsStatus,
          `${macArtifacts.length} macOS artifact(s), ${updateManifests.length} update manifest(s).`,
          "bun run package:mac",
          macArtifacts[0],
        ),
        gate(
          "manifest",
          "Update manifest",
          updateManifests.length > 0 ? "passed" : "pending",
          updateManifests.length > 0
            ? "macOS update manifest evidence is present."
            : "Run manifest generation after packaging.",
          "bun run dist:manifest",
          updateManifests[0],
        ),
        gate(
          "upload-plan",
          "Upload plan",
          uploadPlanStatus,
          uploadPlan?.status === "passed"
            ? `${uploadPlan.artifactCount ?? 0} CDN upload artifact(s) planned for ${uploadPlan.target?.baseUrl ?? "release CDN"}.`
            : "No release CDN upload plan has been generated yet.",
          "bun run dist:upload:dry-run",
          uploadPlan?.manifest,
        ),
        gate(
          "signing",
          "Signing",
          signingStatus,
          report?.signing?.appleIdentityEnv === "set"
            ? "APPLE_IDENTITY is available to electron-builder."
            : "APPLE_IDENTITY is not set in this local environment.",
          "APPLE_IDENTITY=... bun run package:mac",
          report?.signing?.electronBuilderIdentity,
        ),
        gate(
          "credential-preflight",
          "Credential preflight",
          credentialPreflightStatus,
          credentialPreflight?.status === "passed"
            ? "Apple signing/notarization credentials and local release tools are ready."
            : credentialPreflight?.status === "blocked"
              ? `Waiting for Apple credentials: ${(credentialPreflight.missingCredentials ?? []).join(", ") || "missing credentials"}.`
              : credentialPreflight?.status === "failed"
                ? "Apple credential preflight failed."
                : "No Apple signing/notarization credential preflight report found.",
          "bun run release:credentials",
          credentialPreflight?.report,
        ),
        gate(
          "ci-workflow",
          "CI workflow",
          releaseWorkflowStatus,
          report?.signing?.releaseWorkflow?.present
            ? "Release workflow declares signing credentials, notarization, stapling, verification, and evidence upload."
            : "No Moss desktop release CI workflow evidence found.",
          "workflow_dispatch: Moss Desktop Release",
          report?.signing?.releaseWorkflow?.workflowPath,
        ),
        gate(
          "notarization",
          "Notarization",
          notarizationStatus,
          validNotarizationReports.length > 0
            ? "Passing notarytool, stapler, codesign, and spctl evidence was found."
            : "No passing CI notarization report found yet.",
          "bun run release:notarize",
          validNotarizationReports[0] ?? notarizationEvidence[0],
        ),
        gate(
          "evidence-audit",
          "Evidence audit",
          evidenceAuditStatus,
          evidenceAudit?.status === "passed" && evidenceAudit.distributable
            ? `${evidenceAudit.acceptedSubmissions ?? 0} accepted notarytool submission(s) and signed distribution evidence are audit-ready.`
            : evidenceAudit?.status === "blocked"
              ? `${evidenceAudit.blockerCount ?? 0} signed release evidence blocker(s) remain.`
              : "No signed release evidence audit has been recorded yet.",
          "bun run release:evidence:audit",
          evidenceAudit?.report,
        ),
        gate(
          "migration",
          "Migration",
          migrationStatus,
          migrationEvidence
            ? "Migration and data-loss evidence is present."
            : "Migration and data-loss fixture evidence is still pending.",
          "bun run verify:program --release",
          migrationEvidence,
        ),
      ]

      return {
        rootPath,
        latestPath: latest ? ".1code/program/release-packaging/latest.json" : null,
        reportPath: latest?.report ?? null,
        generatedAt: report?.generatedAt ?? latest?.generatedAt ?? null,
        status: report?.status ?? latest?.status ?? "missing",
        scripts: {
          build: report?.scripts?.build ?? "electron-vite build",
          packageMac: report?.scripts?.packageMac ?? "electron-builder --mac",
          distManifest:
            report?.scripts?.distManifest ?? "node scripts/generate-update-manifest.mjs",
          distUpload:
            report?.scripts?.distUpload ?? "node scripts/upload-release.mjs",
          distUploadDryRun:
            report?.scripts?.distUploadDryRun ?? "node scripts/upload-release.mjs --dry-run",
          releaseNotarize:
            report?.scripts?.releaseNotarize ?? "node scripts/notarize-release-artifacts.mjs",
          releaseEvidenceAudit:
            report?.scripts?.releaseEvidenceAudit ?? "node scripts/audit-release-evidence.mjs",
          verifyProgram: "node scripts/verify-program-ledger.mjs --release",
        },
        mac: {
          targets: report?.mac?.targets ?? [],
          hardenedRuntime: report?.mac?.hardenedRuntime ?? false,
          entitlements: report?.mac?.entitlements ?? null,
          entitlementsInherit: report?.mac?.entitlementsInherit ?? null,
          publish: report?.mac?.publish ?? null,
        },
        signing: report?.signing ?? {
          appleIdentityEnv: "missing",
          electronBuilderIdentity: "missing",
          notarizationMode: "external-ci",
          electronBuilderNotarize: false,
          validNotarizationReports: [],
          evidenceAudit: null,
          credentialPreflight: null,
        },
        artifacts: {
          releaseDir: reportArtifacts.releaseDir ?? "release",
          files: releaseFiles,
          macArtifacts,
          updateManifests,
          notarizationEvidence,
        },
        distribution: report?.distribution ?? {
          uploadScript: "scripts/upload-release.mjs",
          uploadPlan: null,
        },
        warnings: report?.warnings ?? [],
        failures: report?.failures ?? [],
        gates,
      }
    }),
})
