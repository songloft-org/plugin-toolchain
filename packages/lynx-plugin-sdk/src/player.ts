import { invokeHost } from './bridge.js'

async function openPlayerUi(method: 'openPlayer' | 'openQueue'): Promise<void> {
  const result = await invokeHost('player', method)
  if (!result.ok) throw new Error(result.error || `player.${method} failed`)
}

export const player = {
  /** Open the fullscreen host player for the current song. Check player.openPlayer in host capabilities. */
  openPlayer: () => openPlayerUi('openPlayer'),
  /** Open the host playback queue. Check player.openQueue in host capabilities. */
  openQueue: () => openPlayerUi('openQueue'),
}
