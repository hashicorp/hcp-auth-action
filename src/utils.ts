/**
 * Copyright (c) HashiCorp, Inc.
 */

// Read the package.json file to get the version of the action.
// eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-commonjs, @typescript-eslint/no-require-imports
export const { version: appVersion } = require('../package.json')

// sourceChannel is the header that identifies the source of the request.
export const sourceChannel = `X-HCP-Source-Channel`

// actionVersion contains the string version of the action.
export const actionVersion = `hcp-auth-action/${appVersion}`
