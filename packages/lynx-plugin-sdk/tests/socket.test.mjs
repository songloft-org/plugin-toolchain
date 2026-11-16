import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
const ts = createRequire(import.meta.url)('typescript')
function sdk() {
  const listeners = new Map(),
    calls = [],
    modules = new Map()
  const environment = {
    Promise,
    Map,
    Set,
    JSON,
    setTimeout,
    clearTimeout,
    lynx: {
      __globalProps: { frameId: 'test-frame' },
      getJSModule: () => ({
        addListener: (name, callback) => listeners.set(name, callback),
      }),
    },
    NativeModules: {
      SongloftPluginBridge: {
        registerChild() {},
        hostCall: (...args) => calls.push(args),
      },
    },
  }
  for (const name of [
    'globals',
    'registration',
    'bridge',
    'events',
    'socket',
  ]) {
    const source = readFileSync(
      new URL('../src/' + name + '.ts', import.meta.url),
      'utf8',
    )
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText
    const exports = {}
    runInNewContext(code, {
      ...environment,
      exports,
      require: (path) => modules.get(path.replace('./', '').replace('.js', '')),
    })
    modules.set(name, exports)
  }
  const reply = (result = { ok: true, data: null }, call = calls.at(-1)) => {
    listeners.get('SongloftPluginBridge.hostReply')({
      callId: call[1],
      result: JSON.stringify(result),
    })
  }
  const push = (frame) =>
    listeners.get('SongloftPluginBridge.push')({
      event: 'pluginSocket',
      data: JSON.stringify(frame),
    })
  return { Socket: modules.get('socket').PluginSocket, calls, reply, push }
}
test('socket messages stay isolated and late events are discarded after close', async () => {
  const h = sdk(),
    first = new h.Socket('/status/ws?device_id=a'),
    params = JSON.parse(h.calls.at(-1)[4])
  h.reply()
  const events = []
  first.onopen = () => events.push('open')
  first.onmessage = (e) => events.push(e.data)
  let closed
  const done = new Promise((resolve) => {
    closed = resolve
  })
  first.onclose = () => {
    events.push('close')
    closed()
  }
  h.push({ id: 'other', type: 'open' })
  assert.equal(first.readyState, 0)
  h.push({ id: params.id, type: 'open' })
  first.send('refresh')
  assert.equal(JSON.parse(h.calls.at(-1)[4]).data, 'refresh')
  h.reply()
  h.push({ id: params.id, type: 'message', data: 'snapshot' })
  first.close()
  h.reply()
  await done
  assert.equal(first.readyState, 3)
  h.push({ id: params.id, type: 'message', data: 'late' })
  assert.deepEqual(events, ['open', 'snapshot', 'close'])
})
test('invalid paths never call the host and sending before open fails', () => {
  const h = sdk()
  for (const path of [
    'https://outside.test',
    '//outside',
    '/../other',
    '/x/%2f',
    '/x#fragment',
  ])
    assert.throws(() => new h.Socket(path), /invalid/)
  assert.equal(h.calls.length, 0)
  const socket = new h.Socket('/chat/ws')
  assert.throws(() => socket.send('early'), /not open/)
  h.reply()
  socket.close()
  h.reply()
})

test('closed sockets ignore late open failures', async () => {
  const h = sdk()
  const socket = new h.Socket('/status/ws')
  const opening = h.calls.find((call) => call[3] === 'socketOpen')
  let errors = 0,
    closes = 0
  socket.onerror = () => errors++
  socket.onclose = () => closes++
  socket.close()
  h.reply()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(socket.readyState, socket.CLOSED)
  h.reply({ ok: false, error: 'late open failure' }, opening)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(errors, 0)
  assert.equal(closes, 1)
})

test('malformed push frames cannot crash an active socket', async () => {
  const h = sdk(),
    socket = new h.Socket('/status/ws')
  h.reply()
  assert.doesNotThrow(() => h.push(null))
  assert.doesNotThrow(() => h.push('invalid'))
  socket.close()
  h.reply()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(socket.readyState, socket.CLOSED)
})
