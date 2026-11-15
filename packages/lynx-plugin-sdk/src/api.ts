import { invokeHost } from './bridge.js'

/** Only routes belonging to this plugin are accepted. Query values may be encoded. */
export function validateApiPath(path: string): void {
  const route = path.split('?')[0]
  if (
    !/^\/api(?:\/|$)/.test(route) ||
    /[\\#\s]/.test(path) ||
    /%/.test(route) ||
    route.split('/').some((part) => part === '.' || part === '..')
  ) {
    throw new Error('invalid plugin API path')
  }
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  validateApiPath(path)
  const reply = await invokeHost(
    'plugin',
    'apiRequest',
    { method, path, body },
    65000,
  )
  if (!reply.ok) throw new Error(reply.error || 'plugin API request failed')
  const data = reply.data as T & { error?: unknown }
  if (data && typeof data === 'object' && data.error)
    throw new Error(String(data.error))
  return data
}

export const apiGet = <T = unknown>(path: string): Promise<T> =>
  request<T>('GET', path)
export const apiPost = <T = unknown>(path: string, body: unknown): Promise<T> =>
  request<T>('POST', path, body)
