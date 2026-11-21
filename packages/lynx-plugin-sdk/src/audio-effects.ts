/** Temporary host audio effects for a plugin's playback session. */
export interface PlaybackAudioEffects {
  equalizer?: { preset: string }
  reverb?: { preset: string }
  stereoWidth?: { preset: string }
}

export interface PlaybackAudioEffectsState {
  playbackId: string | null
  supported: {
    equalizer?: { presets: string[] }
    reverb?: { presets: string[] }
    stereoWidth?: { presets: string[] }
  }
  applied: PlaybackAudioEffects | null
}

export interface ApplyPlaybackAudioEffectsOptions {
  playbackId: string
  effects: PlaybackAudioEffects
}
