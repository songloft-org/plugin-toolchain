import { getFrameId } from './globals.js'

declare const NativeModules: Record<string, {
  registerChild(frameId: string): void
  hostCall(frameId: string, callId: string, ns: string, method: string, params: string): void
}> | undefined

let registered = ''

/** Event-only plugins must be reachable before their first RPC call. */
export function registerChild(): void {
  try {
    const frameId = getFrameId()
    if (!frameId || registered === frameId || typeof NativeModules === 'undefined') return
    const bridge = NativeModules.SongloftPluginBridge
    if (typeof bridge?.registerChild !== 'function') return
    bridge.registerChild(frameId)
    registered = frameId
  } catch { /* A later subscription/RPC can retry an unavailable host. */ }
}

/** Notify the parent only after its child's push listener is installed. */
export function notifyPushReady(): void {
  try {
    const frameId = getFrameId()
    if (frameId && typeof NativeModules !== 'undefined') {
      NativeModules.SongloftPluginBridge?.hostCall(frameId, 'lifecycle-ready', 'lifecycle', 'ready', '{}')
    }
  } catch { /* Older hosts still support their existing RPC/event methods. */ }
}
