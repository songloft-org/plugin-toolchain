/**
 * @songloft/lynx-plugin-sdk
 *
 * SDK for Lynx-native Songloft plugins (renderEngine: "lynx").
 * Runs inside a child <frame> bundle, communicates with the host app
 * through NativeModules.SongloftPluginBridge.
 *
 * Usage:
 *   import { invokeHost, onPlayerState, onThemeChange, getGlobalProps } from '@songloft/lynx-plugin-sdk'
 *
 *   const info = await invokeHost('host', 'getInfo')
 *   onPlayerState((state) => { ... })
 */

export { invokeHost, type HostCallResult } from './bridge.js'
export { onPlayerState, onThemeChange, onPush, type PlayerState } from './events.js'
export { getGlobalProps, getFrameId, getTheme } from './globals.js'
