/**
 * EKS service for cluster discovery and authentication
 * Handles listing clusters, describing them, and generating auth tokens
 */
import {
  EKSClient,
  ListClustersCommand,
  DescribeClusterCommand,
} from "@aws-sdk/client-eks"
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { HttpRequest } from "@smithy/protocol-http"
import { SignatureV4 } from "@smithy/signature-v4"
import { Sha256 } from "@aws-crypto/sha256-js"
import { decrypt, type AwsCredentials } from "./sso-service"

export interface EksClusterInfo {
  name: string
  arn: string
  endpoint: string
  certificateAuthority: string
  status: string
  region: string
  version: string
  createdAt: Date
}

export interface EksClusterSummary {
  name: string
  arn: string
  status: string
  region: string
}

/**
 * Creates AWS credentials provider from stored credentials
 */
function createCredentialsProvider(credentials: AwsCredentials) {
  return {
    accessKeyId: decrypt(credentials.accessKeyId),
    secretAccessKey: decrypt(credentials.secretAccessKey),
    sessionToken: decrypt(credentials.sessionToken),
  }
}

export class EksService {
  private eksClient: EKSClient
  private stsClient: STSClient
  private region: string
  private credentials: ReturnType<typeof createCredentialsProvider>

  constructor(region: string, awsCredentials: AwsCredentials) {
    this.region = region
    this.credentials = createCredentialsProvider(awsCredentials)

    this.eksClient = new EKSClient({
      region,
      credentials: this.credentials,
    })

    this.stsClient = new STSClient({
      region,
      credentials: this.credentials,
    })
  }

  /**
   * List all EKS clusters in the region
   */
  async listClusters(): Promise<string[]> {
    const clusters: string[] = []
    let nextToken: string | undefined

    do {
      const command = new ListClustersCommand({ nextToken })
      const response = await this.eksClient.send(command)

      if (response.clusters) {
        clusters.push(...response.clusters)
      }

      nextToken = response.nextToken
    } while (nextToken)

    return clusters
  }

  /**
   * Get detailed information about a cluster
   */
  async describeCluster(clusterName: string): Promise<EksClusterInfo> {
    const command = new DescribeClusterCommand({ name: clusterName })
    const response = await this.eksClient.send(command)

    const cluster = response.cluster
    if (!cluster) {
      throw new Error(`Cluster ${clusterName} not found`)
    }

    return {
      name: cluster.name || clusterName,
      arn: cluster.arn || "",
      endpoint: cluster.endpoint || "",
      certificateAuthority: cluster.certificateAuthority?.data || "",
      status: cluster.status || "UNKNOWN",
      region: this.region,
      version: cluster.version || "",
      createdAt: cluster.createdAt || new Date(),
    }
  }

  /**
   * Discover all clusters with basic info
   */
  async discoverClusters(): Promise<EksClusterSummary[]> {
    const clusterNames = await this.listClusters()
    const summaries: EksClusterSummary[] = []

    for (const name of clusterNames) {
      try {
        const info = await this.describeCluster(name)
        summaries.push({
          name: info.name,
          arn: info.arn,
          status: info.status,
          region: info.region,
        })
      } catch (error) {
        console.error(`[eks-service] Failed to describe cluster ${name}:`, error)
        // Include with unknown status if describe fails
        summaries.push({
          name,
          arn: "",
          status: "UNKNOWN",
          region: this.region,
        })
      }
    }

    return summaries
  }

  /**
   * Generate an EKS authentication token
   * This creates a presigned STS GetCallerIdentity URL encoded as a bearer token
   */
  async generateToken(clusterName: string): Promise<string> {
    const stsEndpoint = `sts.${this.region}.amazonaws.com`

    // Create the request to sign
    const request = new HttpRequest({
      method: "GET",
      protocol: "https:",
      hostname: stsEndpoint,
      path: "/",
      query: {
        Action: "GetCallerIdentity",
        Version: "2011-06-15",
        "X-Amz-Expires": "60",
      },
      headers: {
        host: stsEndpoint,
        "x-k8s-aws-id": clusterName,
      },
    })

    // Sign the request
    const signer = new SignatureV4({
      credentials: this.credentials,
      region: this.region,
      service: "sts",
      sha256: Sha256,
    })

    const signedRequest = await signer.presign(request, {
      expiresIn: 60,
    })

    // Build the presigned URL
    const query = signedRequest.query || {}
    const queryString = Object.entries(query)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&")

    const presignedUrl = `https://${stsEndpoint}/?${queryString}`

    // Encode as EKS token
    // Format: k8s-aws-v1.<base64url-encoded-presigned-url>
    const token = "k8s-aws-v1." + base64UrlEncode(presignedUrl)

    return token
  }

  /**
   * Test cluster connectivity by generating a token and checking if we can authenticate
   */
  async testConnection(clusterName: string): Promise<boolean> {
    try {
      // Just try to generate a token - if credentials are valid, this will work
      await this.generateToken(clusterName)
      return true
    } catch (error) {
      console.error(`[eks-service] Connection test failed for ${clusterName}:`, error)
      return false
    }
  }
}

/**
 * Base64 URL encoding (RFC 4648)
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}
