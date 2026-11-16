import { invokeHost } from './bridge.js'
import { onPush } from './events.js'
let sequence = 0
/** A text WebSocket scoped to the current plugin. Authentication stays in the host. */
export class PluginSocket {
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event?: unknown) => void) | null = null
  onclose: (() => void) | null = null
  private readonly id = `socket-${++sequence}`
  private unsubscribe: () => void
  constructor(path: string) {
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      /[\\#\s]/.test(path) ||
      /%/.test(path.split('?')[0]) ||
      path
        .split('?')[0]
        .split('/')
        .some((p) => p === '..' || p === '.')
    )
      throw new Error('invalid plugin socket path')
    this.unsubscribe = onPush((event, raw) => {
      if (event !== 'pluginSocket') return
      let frame: { id: string; type: string; data?: string }
      try {
        frame = JSON.parse(String(raw))
      } catch {
        return
      }
      if (
        !frame ||
        typeof frame !== 'object' ||
        frame.id !== this.id ||
        this.readyState === this.CLOSED
      )
        return
      if (frame.type === 'open' && this.readyState === this.CONNECTING) {
        this.readyState = this.OPEN
        this.onopen?.()
      } else if (frame.type === 'message' && this.readyState === this.OPEN)
        this.onmessage?.({ data: frame.data || '' })
      else if (frame.type === 'error') this.fail()
      else if (frame.type === 'close') this.finish()
    })
    void this.call('socketOpen', { path }).catch(() => this.fail())
  }
  private async call(method: string, params: Record<string, unknown> = {}) {
    const result = await invokeHost('plugin', method, {
      ...params,
      id: this.id,
    })
    if (!result.ok) throw new Error(result.error || 'plugin socket failed')
  }
  private fail() {
    if (this.readyState >= this.CLOSING) return
    this.onerror?.()
    this.finish()
  }
  private finish() {
    if (this.readyState === this.CLOSED) return
    this.readyState = this.CLOSED
    this.unsubscribe()
    this.onclose?.()
  }
  send(data: string) {
    if (this.readyState !== this.OPEN) throw new Error('socket is not open')
    void this.call('socketSend', { data }).catch(() => this.fail())
  }
  close(code = 1000, reason = 'client') {
    if (this.readyState >= this.CLOSING) return
    this.readyState = this.CLOSING
    void this.call('socketClose', { code, reason })
      .finally(() => this.finish())
      .catch(() => {})
  }
}
