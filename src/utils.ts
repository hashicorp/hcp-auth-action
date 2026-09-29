/**
 * Copyright (c) HashiCorp, Inc.
 */

import { version } from '../package.json'

// appVersion is the version of the action read from package.json.
export const appVersion = version

// sourceChannel is the header that identifies the source of the request.
export const sourceChannel = `X-HCP-Source-Channel`

// actionVersion contains the string version of the action.
export const actionVersion = `hcp-auth-action/${appVersion}`
