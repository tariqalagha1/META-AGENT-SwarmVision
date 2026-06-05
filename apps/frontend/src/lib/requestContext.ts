export type RequestScope = {
  tenantId?: string
  appId?: string
  appName?: string
  authToken?: string
}

export const AUTH_TOKEN_STORAGE_KEY = 'swarmvision.authToken'

export const getRequestScope = (): RequestScope => {
  const queryParams = new URLSearchParams(window.location.search)
  const storedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? undefined
  const envToken = import.meta.env.VITE_AUTH_TOKEN ?? undefined

  return {
    tenantId: queryParams.get('tenant_id') ?? undefined,
    appId: queryParams.get('app_id') ?? undefined,
    appName: queryParams.get('app_name') ?? undefined,
    authToken: queryParams.get('token') ?? storedToken ?? envToken,
  }
}

export const withRequestScope = (
  url: string,
  scope: RequestScope,
): string => {
  const parsedUrl = new URL(url)
  if (scope.tenantId) parsedUrl.searchParams.set('tenant_id', scope.tenantId)
  if (scope.appId) parsedUrl.searchParams.set('app_id', scope.appId)
  if (scope.appName) parsedUrl.searchParams.set('app_name', scope.appName)
  if (scope.authToken) parsedUrl.searchParams.set('token', scope.authToken)
  return parsedUrl.toString()
}

export const withApiScope = (
  url: string,
  scope: Pick<RequestScope, 'tenantId' | 'appId' | 'appName'>,
): string => {
  const parsedUrl = new URL(url)
  if (scope.tenantId) parsedUrl.searchParams.set('tenant_id', scope.tenantId)
  if (scope.appId) parsedUrl.searchParams.set('app_id', scope.appId)
  if (scope.appName) parsedUrl.searchParams.set('app_name', scope.appName)
  return parsedUrl.toString()
}

export const buildAuthHeaders = (scope: RequestScope): Record<string, string> => {
  if (!scope.authToken) return {}
  return {
    Authorization: `Bearer ${scope.authToken}`,
  }
}
