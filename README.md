# Authenticate to HashiCorp Cloud Platform (HCP) From GitHub Actions

This GitHub Action authenticates to
[HashiCorp Cloud Platform (HCP)](https://www.hashicorp.com/cloud) and makes
credentials available to subsequent Action steps. Pair this action with
[hashicorp/hcp-setup-action](https://github.com/hashicorp/hcp-setup-action) to
use HCP services from your Workflow using the [HCP CLI][hcp-cli].

This action supports authenticating either via Workload Identity Federation or
via Service Principal credentials. It is **strongly recommended** to use
Workload Identity Federation, as it does not require creating and storing any
long lived credential. Instead a trust relationship is created between the
GitHub Actions and HCP, which can be tightly scoped.

## Usage

```yaml
jobs:
  job_id:
    # "id-token" is needed when using Workload Identity Federation.
    permissions:
      contents: 'read'
      id-token: 'write'

    steps:
      - uses: 'hashicorp/hcp-auth-action@v0'
        with:
          workload_identity_provider: 'iam/project/123456789/service-principal/my-sp/workload-identity-provider/my-provider'
```

## Inputs

### Inputs: Workload Identity Federation

The follow Action Inputs are for use when authenticating using Workload Identity
Federation.

- `workload_identity_provider` - (Required) The full name of the Workload
  Identity Provider to use for authentication. This should be in the format
  `iam/project/1234/service-principal/my-sp/workload-identity-provider/my-wip`.

- `audience` - (Optional) The value for the audience (`aud`) parameter in the
  generated GitHub Actions OIDC token. The audience must match the audience the
  HCP Workload Identity Provider expects. By default, HCP expects the audience
  to be the same as the `workload_identity_provider` value. For most use cases,
  this value should not be set.

### Inputs: Service Principal Credentials

> [!CAUTION]
>
> Service Principal Credentials are long-lived credentials and must be treated
> like a password. It is **strongly recommended** to use Workload Identity
> Federation instead.

The follow Action Inputs are for use when authenticating using Service Principal
Credentials.

- `client_id` - (Required) The client ID of the Service Principal to use for
  authentication.

- `client_secret` - (Required) The client secret of the Service Principal to use
  for authentication.

### Inputs: Common

The following inputs are common to both Workload Identity Federation and Service
Principal Credentials.

- `set_access_token` - (Optional) If true, the action will set the access token
  as an output. This can be useful for downstream steps that need to directly
  use the access token to authenticate to HashiCorp Cloud Platform. Default is
  `false`.

- `export_environment_variables` - (Optional) If true, the action will set the
  `HCP_CRED_FILE` environment variable. If false, the action will not export any
  environment variables, meaning future steps are unlikely to be automatically
  authenticated to HCP.

## Outputs

- `organization_id`: The HashiCorp Cloud Platform organization ID that the
  Service Principal is a member of.

- `project_id`: The HashiCorp Cloud Platform Project ID that the Service
  Principal was created in. If using an organization level Service Principal,
  this will not be set.

- `credentials_file_path`: Path on the local filesystem where the generated
  credentials file resides.

- `access_token`: The access token for calling HCP APIs. This is only available
  when "set_access_token" is true.

## Setup

This section describes the possible configuration options:

1. [(Preferred) Workload Identity Federation](#preferred-workload-identity-federation)
1. [Service Principal Credentials](#service-principal-credentials)

### (Preferred) Workload Identity Federation

When using Workload Identity Federation, the GitHub Action's OIDC token will be
sent to the configured Workload Identity Provider. HCP will validate the token
and return a short-lived access token that can be used to authenticate to HCP.

These instructions use the [hcp][hcp-cli] command-line tool.

1. Create a Service Principal in HCP.

   ```sh
   # TODO: replace ${PROJECT_ID} with your value below.
   hcp iam service-principals create "my-sp" --project "${PROJECT_ID}"
   ```

1. Create the Workload Identity Provider and set it up to only allow GitHub
   Actions running in a particular repository to authenticate.

   ```sh
   # TODO: replace ${PROJECT_ID}, ${GITHUB_ORG}, and ${GITHB_REPO} with
   # your values below.
   hcp iam workload-identity-providers create-oidc "github" \
     --project "${PROJECT_ID}" \
     --service-principal "iam/project/${PROJECT_ID}/service-principal/my-sp" \
     --issuer="https://token.actions.githubusercontent.com" \
     --conditional-access 'jwt_claims.repository == "${GITHUB_ORG}/${GITHUB_REPO}"'
   ```

1. Grant the created Service Principal a role on a resource. For this example,
   we will give it access to read Vault Secrets within the project.

   ```sh
   # TODO: replace ${PROJECT_ID} and ${SERVICE_PRINCIPAL_RESOURCE_ID} with your
   # values below.
   hcp projects add-binding \
     --project=${PROJECT_ID} \
     --member=${SERVICE_PRINCIPAL_RESOURCE_ID} \
     --role=roles/secrets.app-secret-reader
   ```

1. Add the `hashicorp/hcp-auth-action` to your GitHub Actions workflow.
   <!-- markdownlint-capture -->
   <!-- markdownlint-disable -->

   ```yaml
   jobs:
     job_id:
       # "id-token" is needed when using Workload Identity Federation.
       permissions:
         contents: 'read'
         id-token: 'write'

       steps:
         - uses: 'hashicorp/hcp-auth-action@v0'
           with:
             workload_identity_provider: '...' # 'iam/project/123456789/service-principal/my-sp/workload-identity-provider/github'

         - uses: 'hashicorp/hcp-setup-action@v0'
           with:
             version: 'latest'

         - name: 'Read a secret and inject as an environment variable'
           run: |
             MY_SECRET=$(hcp vault-secrets secrets open \
               --app=cli --format=json foo | jq -r '.static_version.value')
             echo "::add-mask::$MY_SECRET"
             echo "MY_SECRET=$MY_SECRET" >> $GITHUB_ENV
   ```

   <!-- markdownlint-restore -->

### Service Principal Credentials

When using Service Principal Credentials, the GitHub Action will authenticate to
HCP using the provided Client ID and Client Secret. The credential pair is
long-lived and must be treated like a password. As such, these credentials
should be stored as
[GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).

These instructions use the [hcp][hcp-cli] command-line tool.

1. Create a Service Principal in HCP.

   ```sh
   # TODO: replace ${PROJECT_ID} with your value below.
   hcp iam service-principals create "my-sp" --project "${PROJECT_ID}"
   ```

1. Create a Service Principal Key.

   ```sh
   # TODO: replace ${PROJECT_ID} with your value below.
   hcp iam service-principals keys create iam/project/${PROJECT_ID}/service-principal/my-sp
   ```

1. Create a
   [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
   named `HCP_CLIENT_ID` and `HCP_CLIENT_SECRET` with the values of the Service
   Principal's Client ID and Client Secret.

1. Grant the created Service Principal a role on a resource. For this example,
   we will give it access to read Vault Secrets within the project.

   ```sh
   # TODO: replace ${PROJECT_ID} and ${SERVICE_PRINCIPAL_RESOURCE_ID} with your
   # values below.
   hcp projects add-binding \
     --project=${PROJECT_ID} \
     --member=${SERVICE_PRINCIPAL_RESOURCE_ID} \
     --role=roles/secrets.app-secret-reader
   ```

1. Add the `hashicorp/hcp-auth-action` to your GitHub Actions workflow.
   <!-- markdownlint-capture -->
   <!-- markdownlint-disable -->

   ```yaml
   jobs:
     job_id:
       steps:
         - uses: 'hashicorp/hcp-auth-action@v0'
           with:
             client_id: ${{ secrets.HCP_CLIENT_ID }}
             client_secret: ${{ secrets.HCP_CLIENT_SECRET }}

         - uses: 'hashicorp/hcp-setup-action@v0'
           with:
             version: 'latest'

         - name: 'Read a secret and inject as an environment variable'
           run: |
             MY_SECRET=$(hcp vault-secrets secrets open \
               --app=cli --format=json foo | jq -r '.static_version.value')
             echo "::add-mask::$MY_SECRET"
             echo "MY_SECRET=$MY_SECRET" >> $GITHUB_ENV
   ```

   <!-- markdownlint-restore -->

[hcp-cli]: https://developer.hashicorp.com/hcp/docs/cli
