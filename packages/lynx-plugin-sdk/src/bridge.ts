/**
 * Host call bridge — sends requests to the parent via NativeModules.SongloftPluginBridge
 * and awaits replies via GlobalEventEmitter.
 */

import { getFrameId } from './globals.js'

declare const NativeModules: Record<string, {
  hostCall(frameId: string, callId: string, ns: string, method: string, paramsJson: string): void
  registerChild(frameId: string): void
}> | undefined

declare const lynx: {
  getJSModule(name: string): { addListener(event: string, cb: (data: unknown) => void): void } | undefined
} | undefined

export interface HostCallResult {
  ok: boolean
  data?: unknown
  error?: string
}

let callIdCounter = 0
const pendingCalls = new Map<string, { resolve: (r: HostCallResult) => void }>()
let initialized = false

function ensureInit() {
  if (initialized) return
  initialized = true

  try {
    const frameId = getFrameId()
    if (frameId && typeof NativeModules !== 'undefined') {
      NativeModules.SongloftPluginBridge?.registerChild(frameId)
    }
  } catch { /* no-op */ }

  try {
    if (typeof lynx === 'undefined') return
    const emitter = lynx.getJSModule('GlobalEventEmitter')
    if (!emitter) return
    emitter.addListener('SongloftPluginBridge.hostReply', (data: unknown) => {
      const payload = data as { callId?: string; result?: string }
      if (!payload?.callId) return
      const pending = pendingCalls.get(payload.callId)
      if (!pending) return
      pendingCalls.delete(payload.callId)
      try {
        const result: HostCallResult = JSON.parse(payload.result ?? '{"ok":false,"error":"empty reply"}')
        pending.resolve(result)
      } catch {
        pending.resolve({ ok: false, error: 'invalid reply JSON' })
      }
    })
  } catch { /* no emitter */ }
}

/**
 * Invoke a host method. Returns a promise that resolves when the host replies.
 *
 * @example
 * const info = await invokeHost('host', 'getInfo')
 * await invokeHost('player', 'play', { id: 123 })
 */
export function invokeHost(ns: string, method: string, params?: Record<string, unknown>): Promise<HostCallResult> {
  ensureInit()
  const frameId = getFrameId()
  const callId = `c${++callIdCounter}`

  return new Promise((resolve) => {
    pendingCalls.set(callId, { resolve })

    try {
      if (typeof NativeModules !== 'undefined' && NativeModules.SongloftPluginBridge) {
        NativeModules.SongloftPluginBridge.hostCall(
          frameId, callId, ns, method, JSON.stringify(params ?? {}),
        )
      } else {
        pendingCalls.delete(callId)
        resolve({ ok: false, error: 'SongloftPluginBridge not available' })
      }
    } catch (e) {
      pendingCalls.delete(callId)
      resolve({ ok: false, error: String(e) })
    }

    // Timeout: don't leave promises hanging forever
    setTimeout(() => {
      if (pendingCalls.has(callId)) {
        pendingCalls.delete(callId)
        resolve({ ok: false, error: 'timeout' })
      }
    }, 10000)
  })
}
