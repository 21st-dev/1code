/**
 * Clusters tRPC router for EKS cluster discovery and Kubernetes operations
 */
import { z } from "zod"
import { exec } from "child_process"
import { promisify } from "util"
import { eq } from "drizzle-orm"
import { router, publicProcedure } from "../index"
import { getDatabase, claudeCodeSettings } from "../../db"
import { EksService, type EksClusterSummary, type EksClusterInfo } from "../../aws/eks-service"
import {
  createK8sClient,
  listNodes,
  listNamespaces,
  listPods,
  listDeployments,
  listServices,
  testConnection,
  type K8sNode,
  type K8sNamespace,
  type K8sPod,
} from "../../kubernetes/kubernetes-service"
import { decrypt, type AwsCredentials } from "../../aws/sso-service"

const execAsync = promisify(exec)

// Cache for EKS service instances (keyed by region)
const eksServiceCache = new Map<string, EksService>()

/**
 * Get stored AWS credentials from database
 */
function getStoredCredentials(): AwsCredentials | null {
  const db = getDatabase()
  const settings = db
    .select()
    .from(claudeCodeSettings)
    .where(eq(claudeCodeSettings.id, "default"))
    .get()

  if (
    !settings?.awsAccessKeyId ||
    !settings?.awsSecretAccessKey ||
    !settings?.awsSessionToken
  ) {
    return null
  }

  return {
    accessKeyId: settings.awsAccessKeyId,
    secretAccessKey: settings.awsSecretAccessKey,
    sessionToken: settings.awsSessionToken,
    expiration: settings.awsCredentialsExpiresAt || new Date(),
  }
}

/**
 * Get or create EKS service for a region
 */
function getEksService(region: string): EksService | null {
  const credentials = getStoredCredentials()
  if (!credentials) {
    return null
  }

  // Check if credentials are expired
  if (credentials.expiration < new Date()) {
    console.warn("[clusters] AWS credentials are expired")
    return null
  }

  const cacheKey = `${region}-${credentials.accessKeyId}`
  let service = eksServiceCache.get(cacheKey)

  if (!service) {
    service = new EksService(region, credentials)
    eksServiceCache.set(cacheKey, service)
  }

  return service
}

/**
 * Get Git user email for namespace derivation
 */
async function getGitUserEmail(): Promise<string | null> {
  try {
    const { stdout } = await execAsync("git config --get user.email")
    return stdout.trim() || null
  } catch {
    return null
  }
}

export const clustersRouter = router({
  /**
   * Check if clusters feature is available (AWS credentials present)
   */
  isAvailable: publicProcedure.query(() => {
    const credentials = getStoredCredentials()
    return {
      available: credentials !== null,
      credentialsExpired: credentials
        ? credentials.expiration < new Date()
        : false,
    }
  }),

  /**
   * Get the default region from settings
   */
  getRegion: publicProcedure.query(() => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    return settings?.bedrockRegion || "us-east-1"
  }),

  /**
   * Discover all EKS clusters in the configured region
   */
  discover: publicProcedure.query(async (): Promise<EksClusterSummary[]> => {
    const db = getDatabase()
    const settings = db
      .select()
      .from(claudeCodeSettings)
      .where(eq(claudeCodeSettings.id, "default"))
      .get()

    const region = settings?.bedrockRegion || "us-east-1"
    const service = getEksService(region)

    if (!service) {
      console.warn("[clusters] No AWS credentials available")
      return []
    }

    try {
      return await service.discoverClusters()
    } catch (error) {
      console.error("[clusters] Failed to discover clusters:", error)
      throw new Error(
        `Failed to discover clusters: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }),

  /**
   * Get detailed information about a specific cluster
   */
  get: publicProcedure
    .input(z.object({ clusterName: z.string() }))
    .query(async ({ input }): Promise<EksClusterInfo | null> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const service = getEksService(region)

      if (!service) {
        return null
      }

      try {
        return await service.describeCluster(input.clusterName)
      } catch (error) {
        console.error(`[clusters] Failed to get cluster ${input.clusterName}:`, error)
        return null
      }
    }),

  /**
   * Get cluster connection status
   */
  getStatus: publicProcedure
    .input(z.object({ clusterName: z.string() }))
    .query(async ({ input }): Promise<{ connected: boolean; error?: string }> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const eksService = getEksService(region)

      if (!eksService) {
        return { connected: false, error: "No AWS credentials available" }
      }

      try {
        // Get cluster info and generate token
        const cluster = await eksService.describeCluster(input.clusterName)
        const token = await eksService.generateToken(input.clusterName)

        // Create K8s client and test connection
        const k8sClient = createK8sClient(cluster, token)
        const connected = await testConnection(k8sClient)

        return { connected }
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : "Connection failed",
        }
      }
    }),

  /**
   * List nodes in a cluster
   */
  getNodes: publicProcedure
    .input(z.object({ clusterName: z.string() }))
    .query(async ({ input }): Promise<K8sNode[]> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const eksService = getEksService(region)

      if (!eksService) {
        throw new Error("No AWS credentials available")
      }

      const cluster = await eksService.describeCluster(input.clusterName)
      const token = await eksService.generateToken(input.clusterName)
      const k8sClient = createK8sClient(cluster, token)

      return await listNodes(k8sClient)
    }),

  /**
   * List namespaces in a cluster
   */
  getNamespaces: publicProcedure
    .input(z.object({ clusterName: z.string() }))
    .query(async ({ input }): Promise<K8sNamespace[]> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const eksService = getEksService(region)

      if (!eksService) {
        throw new Error("No AWS credentials available")
      }

      const cluster = await eksService.describeCluster(input.clusterName)
      const token = await eksService.generateToken(input.clusterName)
      const k8sClient = createK8sClient(cluster, token)

      return await listNamespaces(k8sClient)
    }),

  /**
   * List pods in a namespace
   */
  getPods: publicProcedure
    .input(z.object({ clusterName: z.string(), namespace: z.string() }))
    .query(async ({ input }): Promise<K8sPod[]> => {
      const db = getDatabase()
      const settings = db
        .select()
        .from(claudeCodeSettings)
        .where(eq(claudeCodeSettings.id, "default"))
        .get()

      const region = settings?.bedrockRegion || "us-east-1"
      const eksService = getEksService(region)

      if (!eksService) {
        throw new Error("No AWS credentials available")
      }

      const cluster = await eksService.describeCluster(input.clusterName)
      const token = await eksService.generateToken(input.clusterName)
      const k8sClient = createK8sClient(cluster, token)

      return await listPods(k8sClient, input.namespace)
    }),

  /**
   * Derive default namespace from email environment variables or git config
   * Pattern: john.doe@example.com → johndoe
   */
  getDefaultNamespace: publicProcedure.query(async (): Promise<string | null> => {
    // Priority: DEVELOPER_EMAIL > GITHUB_EMAIL > git config user.email
    const email =
      process.env.DEVELOPER_EMAIL ||
      process.env.GITHUB_EMAIL ||
      (await getGitUserEmail())

    if (!email) {
      return null
    }

    // Extract username before @, remove dots
    // john.doe@example.com → johndoe
    const namespace = email.split("@")[0].replace(/\./g, "")
    return namespace
  }),
})
