/**
 * Event subscriptions — listen for state/theme pushes from the host.
 */

declare const lynx: {
  getJSModule(name: string): { addListener(event: string, cb: (data: unknown) => void): void } | undefined
} | undefined

export interface PlayerState {
  queue: Array<{ id: number; title?: string; artist?: string }>
  current_index: number
  current_song: { id: number; title?: string; artist?: string } | null
  is_playing: boolean
  current_time: number
  duration: number
  volume: number
  play_mode: string
  source_playlist_id: number | null
}

type PushCallback = (event: string, data: unknown) => void
type PlayerStateCallback = (state: PlayerState) => void
type ThemeCallback = (theme: 'light' | 'dark') => void

const pushListeners: PushCallback[] = []
const playerStateListeners: PlayerStateCallback[] = []
const themeListeners: ThemeCallback[] = []
let eventsInitialized = false

function ensureEvents() {
  if (eventsInitialized) return
  eventsInitialized = true

  try {
    if (typeof lynx === 'undefined') return
    const emitter = lynx.getJSModule('GlobalEventEmitter')
    if (!emitter) return

    emitter.addListener('SongloftPluginBridge.push', (data: unknown) => {
      const payload = data as { event?: string; data?: string }
      if (!payload?.event) return

      for (const cb of pushListeners) cb(payload.event, payload.data)

      if (payload.event === 'playerState' && payload.data) {
        try {
          const state: PlayerState = JSON.parse(payload.data)
          for (const cb of playerStateListeners) cb(state)
        } catch { /* invalid JSON */ }
      }

      if (payload.event === 'theme' && payload.data) {
        try {
          const { theme } = JSON.parse(payload.data) as { theme: 'light' | 'dark' }
          for (const cb of themeListeners) cb(theme)
        } catch { /* invalid JSON */ }
      }
    })
  } catch { /* no emitter */ }
}

/** Subscribe to all push events from the host. */
export function onPush(cb: PushCallback): () => void {
  ensureEvents()
  pushListeners.push(cb)
  return () => {
    const i = pushListeners.indexOf(cb)
    if (i >= 0) pushListeners.splice(i, 1)
  }
}

/** Subscribe to player state updates from the host. */
export function onPlayerState(cb: PlayerStateCallback): () => void {
  ensureEvents()
  playerStateListeners.push(cb)
  return () => {
    const i = playerStateListeners.indexOf(cb)
    if (i >= 0) playerStateListeners.splice(i, 1)
  }
}

/** Subscribe to theme changes from the host. */
export function onThemeChange(cb: ThemeCallback): () => void {
  ensureEvents()
  themeListeners.push(cb)
  return () => {
    const i = themeListeners.indexOf(cb)
    if (i >= 0) themeListeners.splice(i, 1)
  }
}
