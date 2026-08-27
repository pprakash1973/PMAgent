// PM Agent — Azure App Service infrastructure
//
// Scope: resource group. Provisions the compute, observability and secret
// storage the application needs. It deliberately does NOT create the database
// or write any secret value — see infra/README.md.
//
//   az deployment group create \
//     --resource-group <rg> \
//     --template-file infra/main.bicep \
//     --parameters infra/main.parameters.json
//
// Two settings below are load-bearing and easy to get wrong:
//
//   alwaysOn            Artifact generation is detached from the HTTP request
//                       with after() from next/server. That needs a process
//                       that outlives the response. On a plan that idles out or
//                       scales to zero, generation is killed mid-flight and the
//                       artifact is left stuck in "generating". Any tier below
//                       Basic cannot set this.
//
//   linuxFxVersion      Must match the Node major the standalone bundle was
//                       built against. A mismatch surfaces as native module
//                       load failures at boot, not at deploy.

targetScope = 'resourceGroup'

@description('Short name for the workload; used as a prefix for every resource.')
@minLength(3)
@maxLength(12)
param workloadName string = 'pmagent'

@description('Deployment environment discriminator.')
@allowed(['dev', 'test', 'prod'])
param environment string = 'dev'

@description('Region for all resources. Choose deliberately — UK/EU customer data carries residency obligations.')
param location string = resourceGroup().location

@description('App Service plan SKU. B1 is the smallest that supports alwaysOn; P1v3 is the smallest recommended for production.')
@allowed(['B1', 'B2', 'P0v3', 'P1v3', 'P2v3'])
param appServicePlanSku string = 'B1'

@description('Node runtime. Must match the major version the standalone bundle was built with.')
@allowed(['NODE|20-lts', 'NODE|22-lts'])
param nodeVersion string = 'NODE|22-lts'

@description('Public origin the app is served from, used to build invitation links. A wrong value sends users to localhost.')
param publicOrigin string = ''

@description('Set true when the database is reached over a network that blocks outbound TCP 5432, or when using Neon.')
param useWebSocketDbDriver bool = false

@description('Existing Log Analytics workspace resource id. Leave empty to create one.')
param existingLogAnalyticsId string = ''

@description('Object id of the group or user that should administer the key vault. Leave empty to skip the role assignment.')
param keyVaultAdminObjectId string = ''

@description('Tags applied to every resource.')
param tags object = {
  workload: workloadName
  environment: environment
  managedBy: 'bicep'
}

var suffix = uniqueString(resourceGroup().id, workloadName, environment)
var namePrefix = '${workloadName}-${environment}'
// Key vault names are globally unique, 3-24 chars, alphanumeric and dashes.
var keyVaultName = take('kv-${workloadName}-${environment}-${suffix}', 24)
var resolvedOrigin = empty(publicOrigin) ? 'https://${namePrefix}-app.azurewebsites.net' : publicOrigin

// ── Observability ───────────────────────────────────────────────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = if (empty(existingLogAnalyticsId)) {
  name: '${namePrefix}-log'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

var logAnalyticsId = empty(existingLogAnalyticsId) ? logAnalytics.id : existingLogAnalyticsId

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-appi'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsId
    IngestionMode: 'LogAnalytics'
  }
}

// ── Secret storage ──────────────────────────────────────────────────────────
// RBAC rather than access policies. No secret VALUES are set here: a Bicep
// parameter carrying a secret is recorded in the deployment history in plain
// text and readable by anyone with reader access to the resource group.

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

// ── Compute ─────────────────────────────────────────────────────────────────

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${namePrefix}-plan'
  location: location
  tags: tags
  sku: {
    name: appServicePlanSku
  }
  kind: 'linux'
  properties: {
    reserved: true // required for Linux
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: '${namePrefix}-app'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned' // used for key vault references
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: nodeVersion
      // Next.js standalone emits server.js at the bundle root.
      appCommandLine: 'node server.js'
      // after() needs a process that outlives the response — see header note.
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      healthCheckPath: '/login'
      appSettings: [
        // ── Build behaviour ──────────────────────────────────────────────
        {
          // The standalone bundle is built in CI and deployed complete.
          // Leaving Oryx enabled makes it try to rebuild on the app host,
          // which fails or produces a different bundle than the one tested.
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
        {
          name: 'WEBSITES_PORT'
          value: '3000'
        }

        // ── Identity ─────────────────────────────────────────────────────
        {
          // The app refuses to boot if this is missing or under 32 chars.
          name: 'AUTH_SECRET'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=auth-secret)'
        }
        {
          name: 'NEXTAUTH_URL'
          value: resolvedOrigin
        }

        // ── Data ─────────────────────────────────────────────────────────
        {
          name: 'DATABASE_URL'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=database-url)'
        }
        {
          // Per worker process, and App Service runs several per instance.
          name: 'DATABASE_POOL_MAX'
          value: '5'
        }
        {
          name: 'DATABASE_DRIVER'
          value: useWebSocketDbDriver ? 'neon' : ''
        }

        // ── Model providers ──────────────────────────────────────────────
        {
          name: 'ANTHROPIC_API_KEY'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=anthropic-api-key)'
        }
        {
          // Leave as 'off' until an embedding endpoint is provisioned.
          // Retrieval runs keyword-only in that state, by design.
          name: 'EMBEDDING_PROVIDER'
          value: 'off'
        }

        // ── Scheduled jobs ───────────────────────────────────────────────
        {
          // Unset means the cron endpoints refuse every caller.
          name: 'CRON_SECRET'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=cron-secret)'
        }

        // ── Telemetry ────────────────────────────────────────────────────
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
      ]
    }
  }
}

// Let the app read key vault references using its managed identity.
var keyVaultSecretsUser = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

resource appCanReadSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, webApp.id, keyVaultSecretsUser)
  properties: {
    roleDefinitionId: keyVaultSecretsUser
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

var keyVaultAdministrator = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '00482a5a-887f-4fb3-b363-3b7fe8e74483'
)

resource adminCanManageSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(keyVaultAdminObjectId)) {
  scope: keyVault
  name: guid(keyVault.id, keyVaultAdminObjectId, keyVaultAdministrator)
  properties: {
    roleDefinitionId: keyVaultAdministrator
    principalId: keyVaultAdminObjectId
  }
}

// ── Outputs ─────────────────────────────────────────────────────────────────

output webAppName string = webApp.name
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output keyVaultName string = keyVault.name
output appPrincipalId string = webApp.identity.principalId
output appInsightsName string = appInsights.name
output requiredSecrets array = [
  'auth-secret'
  'database-url'
  'anthropic-api-key'
  'cron-secret'
]
