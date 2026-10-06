import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

function sdk({ ready = true } = {}) {
  const listeners = new Map(), calls = [], modules = new Map()
  const environment = { ready }
  const emitter = { addListener: (name, callback) => {
    const list = listeners.get(name) ?? []; list.push(callback); listeners.set(name, list)
  } }
  const push = (event, data) => listeners.get('SongloftPluginBridge.push')?.forEach(fn => fn({ event, data: JSON.stringify(data) }))
  const globals = {
    lynx: { __globalProps: { frameId: 'frame-1' }, getJSModule: () => environment.ready ? emitter : undefined },
    NativeModules: { SongloftPluginBridge: {
      registerChild: id => calls.push(['register', id]),
      hostCall: (...args) => { calls.push(args); if (args[3] === 'ready') push('lifecycle', { state: 'resumed' }) },
    } },
    setTimeout: () => {},
  }
  for (const name of ['globals', 'registration', 'events', 'bridge']) {
    const source = readFileSync(new URL('../src/' + name + '.ts', import.meta.url), 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    const exports = {}
    runInNewContext(code, { ...globals, exports, require: path => modules.get(path.replace('./', '').replace('.js', '')) })
    modules.set(name, exports)
  }
  return { events: modules.get('events'), bridge: modules.get('bridge'), calls, push, listeners, environment }
}

test('an event-only plugin registers its child, receives initial lifecycle and then each resume', () => {
  const h = sdk(), seen = []
  const off = h.events.onPush((event, data) => seen.push([event, JSON.parse(data)]))
  assert.deepEqual(h.calls[0], ['register', 'frame-1'])
  assert.equal(seen.length, 1)
  h.push('lifecycle', { state: 'resumed' }); assert.equal(seen.length, 2)
  off(); h.push('lifecycle', { state: 'resumed' }); assert.equal(seen.length, 2)
})

test('RPC and multiple push subscriptions share registration and one SDK emitter listener', () => {
  const h = sdk()
  void h.bridge.invokeHost('host', 'getInfo')
  const first = [], second = []
  h.events.onPush((event, data) => first.push([event, data]))
  h.events.onPush((event, data) => second.push([event, data]))
  h.push('lifecycle', { state: 'resumed' })
  assert.equal(h.calls.filter(c => c[0] === 'register').length, 1)
  assert.equal(h.listeners.get('SongloftPluginBridge.push').length, 1)
  assert.equal(first.length, 2); assert.equal(second.length, 1)
})

test('a subscription before the emitter is ready can initialize on a later subscription', () => {
  const h = sdk({ ready: false }), seen = []
  h.events.onPush((event, data) => seen.push([event, data]))
  assert.equal(h.listeners.size, 0)
  h.environment.ready = true
  h.events.onThemeChange(() => {})
  assert.equal(h.listeners.get('SongloftPluginBridge.push').length, 1)
  assert.equal(seen[0][0], 'lifecycle')
})
