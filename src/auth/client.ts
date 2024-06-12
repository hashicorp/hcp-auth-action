import { HttpClient } from '@actions/http-client'
import { promises as fs } from 'fs'
import { sourceChannel, actionVersion } from '../utils'

/**
 * Client defines the interface for an auth client that can be used to
 * authenticate with HCP.
 */
export interface Client {
  /**
   * getToken() gets or generates the best token for the auth client.
   */
  getToken(): Promise<string>

  /**
   * createCredentialsFile creates a credential file (for use with hcp CLI and
   * other HCP tools) that instructs the tool how to perform identity federation.
   */
  createCredentialsFile(outputPath: string): Promise<string>
}

/**
 * WorkloadIdentityFederationClientParameters is used as input to the
 * WorkloadIdentityFederationClient.
 */
export interface WorkloadIdentityFederationClientParameters {
  readonly githubOIDCToken: string
  readonly githubOIDCTokenRequestURL: string
  readonly githubOIDCTokenRequestToken: string
  readonly githubOIDCTokenAudience: string
  readonly workloadIdentityProviderResourceName: string
}

/**
 * WorkloadIdentityFederationClient is an authentication client that configures
 * a Workload Identity authentication scheme.
 */
export class WorkloadIdentityFederationClient implements Client {
  readonly #httpClient: HttpClient
  readonly #githubOIDCToken: string
  readonly #githubOIDCTokenRequestURL: string
  readonly #githubOIDCTokenRequestToken: string
  readonly #githubOIDCTokenAudience: string
  readonly #wipResourceName: string

  constructor(opts: WorkloadIdentityFederationClientParameters) {
    this.#githubOIDCToken = opts.githubOIDCToken
    this.#githubOIDCTokenRequestURL = opts.githubOIDCTokenRequestURL
    this.#githubOIDCTokenRequestToken = opts.githubOIDCTokenRequestToken
    this.#githubOIDCTokenAudience = opts.githubOIDCTokenAudience
    this.#wipResourceName = opts.workloadIdentityProviderResourceName

    // Create the http client with our user agent.
    this.#httpClient = new HttpClient(actionVersion, undefined, {
      allowRedirects: true,
      allowRetries: true,
      keepAlive: true,
      maxRedirects: 5,
      maxRetries: 3
    })
  }

  /**
   * getToken exchanges the GitHub OIDC token for a HCP Access Token.
   */
  async getToken(): Promise<string> {
    const pth = `https://api.cloud.hashicorp.com/2019-12-10/${this.#wipResourceName}/exchange-token`
    const headers = {
      [sourceChannel]: actionVersion
    }
    const reqBody = {
      jwt_token: this.#githubOIDCToken
    }

    try {
      const resp = await this.#httpClient.postJson<{ access_token: string }>(
        pth,
        reqBody,
        headers
      )

      const access_token = resp.result?.access_token
      if (!access_token) {
        throw new Error(
          `Successfully called ${pth}, but the result didn't contain an access_token: ${resp.result || '[no body]'}`
        )
      }

      return access_token
    } catch (err) {
      throw new Error(`Failed to generate HCP Access Token: ${err.message}`)
    }
  }

  /**
   * createCredentialsFile writes a Workload Identity Federation credential file
   * to disk at the specific outputPath.
   */
  async createCredentialsFile(outputPath: string): Promise<string> {
    const requestURL = new URL(this.#githubOIDCTokenRequestURL)

    // Append the audience value to the request.
    requestURL.searchParams.set('audience', this.#githubOIDCTokenAudience)

    const data: Record<string, unknown> = {
      scheme: `workload`,
      workload: {
        provider_resource_name: this.#wipResourceName,
        url: {
          url: requestURL,
          headers: {
            Authorization: `Bearer ${this.#githubOIDCTokenRequestToken}`
          },
          format_type: `json`,
          subject_cred_pointer: `/value`
        }
      }
    }

    await fs.writeFile(outputPath, JSON.stringify(data), {
      mode: 0o640,
      flag: 'wx',
      flush: true
    })
    return outputPath
  }
}

/**
 * ServicePrincipalCredsClientParameters is used as input to the
 * ServicePrincipalCredsClient.
 */
export interface ServicePrincipalCredsClientParameters {
  readonly clientID: string
  readonly clientSecret: string
}

/**
 * ServicePrincipalCredsClient is an authentication client that configures
 * a service principal credentials authentication scheme.
 */
export class ServicePrincipalCredsClient implements Client {
  readonly #httpClient: HttpClient
  readonly #clientID: string
  readonly #clientSecret: string

  constructor(opts: ServicePrincipalCredsClientParameters) {
    this.#clientID = opts.clientID
    this.#clientSecret = opts.clientSecret

    // Create the http client with our user agent.
    this.#httpClient = new HttpClient(actionVersion, undefined, {
      allowRedirects: true,
      allowRetries: true,
      keepAlive: true,
      maxRedirects: 5,
      maxRetries: 3
    })
  }
  /**
   * getToken exchanges the credentials for an access token.
   */

  async getToken(): Promise<string> {
    const pth = 'https://auth.idp.hashicorp.com/oauth/token'
    const headers = {
      'content-type': 'application/x-www-form-urlencoded'
    }
    const params = {
      grant_type: 'client_credentials',
      client_id: this.#clientID,
      client_secret: this.#clientSecret,
      audience: 'https://api.hashicorp.cloud'
    }
    const searchParams = new URLSearchParams(params)

    try {
      const resp = await this.#httpClient.post(
        pth,
        searchParams.toString(),
        headers
      )

      const respBody = await resp.readBody()
      const statusCode = resp.message.statusCode || 500
      if (statusCode < 200 || statusCode > 299) {
        throw new Error(
          `Failed to call ${pth}: HTTP ${statusCode}: ${respBody || '[no body]'}`
        )
      }

      const obj = JSON.parse(respBody)
      const access_token = obj.access_token
      if (!access_token) {
        throw new Error(
          `Successfully called ${pth}, but the result didn't contain an access_token: ${respBody}`
        )
      }

      return access_token
    } catch (err) {
      throw new Error(`Failed to generate HCP Access Token: ${err.message}`)
    }
  }

  /**
   * createCredentialsFile writes a oauth credential file to disk at the
   * specific outputPath.
   */
  async createCredentialsFile(outputPath: string): Promise<string> {
    const data: Record<string, unknown> = {
      scheme: `service_principal_creds`,
      oauth: {
        client_id: this.#clientID,
        client_secret: this.#clientSecret
      }
    }

    await fs.writeFile(outputPath, JSON.stringify(data), {
      mode: 0o640,
      flag: 'wx',
      flush: true
    })
    return outputPath
  }
}
