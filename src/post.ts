import { setFailed, info, warning } from '@actions/core'
import { rmRF } from '@actions/io'

/**
 * The post action cleans up the credential file that was created during the
 * run.
 */
export async function run(): Promise<void> {
  try {
    // Retrieve the path to the credentials file by looking up the environment
    // variable that was set.
    const credentialsPath = process.env['GHA_HCP_CRED_FILE']
    if (!credentialsPath) {
      warning(
        'GHA_HCP_CRED_FILE environment variable not set. No credentials to clean up. Exiting.'
      )
      return
    }

    // Delete the file.
    await rmRF(credentialsPath)
    info(`Deleted credential file at ${credentialsPath}`)
  } catch (err) {
    setFailed(`hashicorp/hcp-auth-action post failed with: ${err}`)
  }
}

run()
