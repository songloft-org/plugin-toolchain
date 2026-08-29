import { useCallback, useEffect, useState } from '@lynx-js/react'
import { invokeHost, onPlayerState, getTheme, getFrameId, type PlayerState } from '@songloft/lynx-plugin-sdk'

export function App() {
  const [theme, setTheme] = useState(getTheme())
  const [playerState, setPlayerState] = useState<PlayerState | null>(null)

  useEffect(() => onPlayerState(setPlayerState), [])

  const handlePlay = useCallback(async () => {
    await invokeHost('player', 'togglePlay')
  }, [])

  return (
    <view style={{ padding: '20px', backgroundColor: theme === 'dark' ? '#1a1a1a' : '#fff' }}>
      <text style={{ fontSize: '18px', fontWeight: 'bold', color: theme === 'dark' ? '#fff' : '#000' }}>
        {{name}}
      </text>
      <text style={{ fontSize: '14px', marginTop: '8px', color: '#888' }}>
        Lynx Native Plugin • frameId: {getFrameId()}
      </text>
      {playerState && (
        <text style={{ fontSize: '14px', marginTop: '8px', color: '#888' }}>
          {playerState.is_playing ? '▶' : '⏸'} {playerState.current_song?.title ?? 'Nothing playing'}
        </text>
      )}
      <view
        bindtap={handlePlay}
        style={{ marginTop: '16px', padding: '12px 24px', backgroundColor: '#4f46e5', borderRadius: '8px', alignItems: 'center' }}
      >
        <text style={{ color: '#fff', fontSize: '14px' }}>Toggle Play</text>
      </view>
    </view>
  )
}
