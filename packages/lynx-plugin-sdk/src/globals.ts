/**
 * Read host-injected data from global-props (set by the parent <frame> element).
 */

declare const lynx: { __globalProps?: Record<string, unknown> } | undefined

export interface PluginGlobalProps {
  frameId: string
  theme: 'light' | 'dark'
  hostVersion: string
  embed: boolean
}

export function getGlobalProps(): Partial<PluginGlobalProps> {
  try {
    if (typeof lynx !== 'undefined' && lynx?.__globalProps) {
      return lynx.__globalProps as Partial<PluginGlobalProps>
    }
  } catch { /* bare global not available */ }
  return {}
}

export function getFrameId(): string {
  return (getGlobalProps().frameId as string) ?? ''
}

export function getTheme(): 'light' | 'dark' {
  return (getGlobalProps().theme as 'light' | 'dark') ?? 'light'
}
