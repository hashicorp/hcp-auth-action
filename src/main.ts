/**
 * Copyright (c) HashiCorp, Inc.
 */

import {
  exportVariable,
  getBooleanInput,
  getIDToken,
  getInput,
  setFailed,
  setOutput,
  setSecret
} from '@actions/core'
import * as Auth from './auth/client'
import * as Iam from './iam/client'
import * as crypto from 'crypto'
import { join as pathjoin } from 'path'

const oidcWarning =
  `The GitHub Actions variables $ACTIONS_ID_TOKEN_REQUEST_TOKEN and/or ` +
  `$ACTIONS_ID_TOKEN_REQUEST_URL were not provider to this job. This most likely means the ` +
  `GitHub Actions workflow permissions are incorrect. Please see ` +
  `https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token`

if (require.main === module) {
  run()
}

export async function run(): Promise<void> {
  try {
    await realRun()
  } catch (err) {
    setFailed(`hashicorp/hcp-auth-action failed: ${err.message}`)
  }
}

async function realRun(): Promise<void> {
  const workloadIdentityProvider = getInput(`workload_identity_provider`)
  const oidcTokenAudience = getInput(`audience`) || workloadIdentityProvider
  const setAccessToken = getBooleanInput(`set_access_token`)
  const exportEnvironmentVariables = getBooleanInput(
    `export_environment_variables`
  )
  const spClientID = getInput(`client_id`)
  const spClientSecret = getInput(`client_secret`)

  // Ensure either workload_identity_provider or client_id/secret was
  // provided.
  if (
    (workloadIdentityProvider && (spClientID || spClientSecret)) ||
    (!workloadIdentityProvider && !(spClientID && spClientSecret))
  ) {
    throw new Error(
      'The GitHub Action workflow must specify exactly one of ' +
        '"workload_identity_provider" or "client_id" and "client_secret".'
    )
  }

  // Ensure that the github workspace variable is set.
  // The credentials are written here so that they can be made available to
  // subsequent steps. This is used instead of the RUNNER_TEMP directory so that
  // Docker steps also can access the credentials:
  // https://docs.github.com/en/actions/creating-actions/creating-a-docker-container-action#accessing-files-created-by-a-container-action
  //
  // This however does mean we need a post action to clean up the credentials.
  const githubWorkspace = process.env.GITHUB_WORKSPACE
  if (!githubWorkspace) {
    throw new Error('$GITHUB_WORKSPACE is not set')
  }

  // Get an auth client
  let client: Auth.Client
  if (workloadIdentityProvider) {
    // Check we have the expected actions token environment variables.
    const oidcTokenRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
    const oidcTokenRequestURL = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
    if (!oidcTokenRequestToken || !oidcTokenRequestURL) {
      throw new Error(oidcWarning)
    }

    const oidcToken = await getIDToken(oidcTokenAudience)
    client = new Auth.WorkloadIdentityFederationClient({
      githubOIDCToken: oidcToken,
      githubOIDCTokenRequestURL: oidcTokenRequestURL,
      githubOIDCTokenRequestToken: oidcTokenRequestToken,
      githubOIDCTokenAudience: oidcTokenAudience,
      workloadIdentityProviderResourceName: workloadIdentityProvider
    })
  } else {
    client = new Auth.ServicePrincipalCredsClient({
      clientID: spClientID,
      clientSecret: spClientSecret
    })
  }

  // Create credentials file and export the GHA_HCP_CRED_FILE variable so that
  // we can cleanup the file.
  const randomPart = crypto.randomBytes(8).toString('hex')
  const outputFile = `gha-creds-${randomPart}.json`
  const outputPath = pathjoin(githubWorkspace, outputFile)
  const credentialsPath = await client.createCredentialsFile(outputPath)
  setOutput('credentials_file_path', credentialsPath)
  exportVariable('GHA_HCP_CRED_FILE', credentialsPath)

  // Retrieve the access token.
  const authToken = await client.getToken()
  if (setAccessToken) {
    setSecret(authToken)
    setOutput('access_token', authToken)
  }

  // Get details about the authenticated service principal.
  const iamClient = new Iam.Client(authToken)
  const spDetails: Iam.PrincipalDetails = await iamClient.getCallerDetails()
  setOutput('organization_id', spDetails.organizationID)
  if (spDetails.projectID) {
    setOutput('project_id', spDetails.projectID)
  }

  // Export the environment variables if requested.
  if (exportEnvironmentVariables) {
    exportVariable('HCP_CRED_FILE', credentialsPath)
  }
}
