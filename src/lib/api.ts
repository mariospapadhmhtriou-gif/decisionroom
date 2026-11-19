/** Typed client for the server actions in src/actions/index.ts. */

import { getAuthToken } from 'deepspace'

export type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string; details?: Record<string, unknown> }

export async function callAction<T>(
  name: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ActionResponse<T>> {
  try {
    const token = await getAuthToken()
    if (!token) return { success: false, error: 'You are signed out. Sign in again to continue.', code: 'unauthorized' }
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
      signal,
    })
    if (res.status === 401) return { success: false, error: 'Your session expired. Sign in again.', code: 'unauthorized' }
    const body = (await res.json().catch(() => null)) as ActionResponse<T> | null
    if (!body || typeof body.success !== 'boolean') {
      return { success: false, error: `Unexpected server response (${res.status}).`, code: 'bad_response' }
    }
    return body
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { success: false, error: 'Cancelled.', code: 'aborted' }
    return { success: false, error: 'Network error. Check your connection and try again.', code: 'network' }
  }
}
