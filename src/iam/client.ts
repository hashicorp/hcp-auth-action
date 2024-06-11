import { HttpClient } from '@actions/http-client'
import * as Auth from '@actions/http-client/lib/auth'
import { sourceChannel, actionVersion } from '../utils'

/**
 * PrincipalDetails contains details about the principal that is authenticated.
 */
export interface PrincipalDetails {
  readonly projectID: string
  readonly organizationID: string
}

/**
 * CallerIdentityResponse is the response for the CallerIdentity API.
 */
interface CallerIdentityResponse {
  principal: Principal
}

/**
 * Principal is the returned principal from the IAM service.
 */
interface Principal {
  id: string
  type: string
  service: {
    id: string
    resource_name: string
    organization_id: string
    project_id: string
  }
}

/**
 * Client is a client that retrieves details about the authenticated principal
 */
export class Client {
  readonly #httpClient: HttpClient

  constructor(accessToken: string) {
    const ph: Auth.BearerCredentialHandler = new Auth.BearerCredentialHandler(
      accessToken
    )

    // Create the http client with our user agent.
    this.#httpClient = new HttpClient(actionVersion, [ph], {
      allowRedirects: true,
      allowRetries: true,
      keepAlive: true,
      maxRedirects: 5,
      maxRetries: 3,
      headers: {
        [sourceChannel]: actionVersion
      }
    })
  }

  /**
   * getCallerDetails retrieves details about the authenticated principal.
   */
  async getCallerDetails(): Promise<PrincipalDetails> {
    const pth = 'https://api.cloud.hashicorp.com/iam/2019-12-10/caller-identity'
    try {
      const resp = await this.#httpClient.getJson<CallerIdentityResponse>(pth)
      const serviceID = resp.result?.principal?.service?.id
      const organizationID = resp.result?.principal?.service?.organization_id
      const projectID = resp.result?.principal?.service?.project_id
      if (!serviceID || !organizationID) {
        throw new Error(
          `Successfully called ${pth}, but the result contained unexpected values: ${resp.result || '[no body]'}`
        )
      }

      const result: PrincipalDetails = {
        projectID: projectID || '',
        organizationID
      }

      return result
    } catch (err) {
      throw new Error(`Failed to get caller identity: ${err.message}`)
    }
  }
}
