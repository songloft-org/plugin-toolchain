import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
function sdk() {
  const modules = new Map(),
    listeners = new Map(),
    timers = new Map(),
    calls = []
  let id = 0
  const environment = {
    lynx: {
      __globalProps: { frameId: 'bili-frame' },
      getJSModule: () => ({
        addListener: (event, cb) => listeners.set(event, cb),
      }),
    },
    NativeModules: {
      SongloftPluginBridge: {
        registerChild() {},
        hostCall: (...args) => calls.push(args),
      },
    },
    setTimeout: (fn, ms) => {
      timers.set(++id, { fn, ms })
      return id
    },
    clearTimeout: (id) => timers.delete(id),
  }
  for (const name of ['globals', 'registration', 'bridge', 'api', 'player']) {
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
  return {
    api: modules.get('api'),
    bridge: modules.get('bridge'),
    player: modules.get('player').player,
    calls,
    timers,
    reply: (result) =>
      listeners.get('SongloftPluginBridge.hostReply')({
        callId: calls.at(-1)[1],
        result: JSON.stringify(result),
      }),
  }
}
test('GET and POST route through the host without credentials and clear completed timers', async () => {
  const h = sdk(),
    first = h.api.apiGet('/api/login/poll?key=a%2Fb')
  assert.deepEqual(JSON.parse(h.calls[0][4]), {
    method: 'GET',
    path: '/api/login/poll?key=a%2Fb',
  })
  h.reply({ ok: true, data: { logged_in: true } })
  assert.equal((await first).logged_in, true)
  assert.equal(h.timers.size, 0)
  const second = h.api.apiPost('/api/settings', { audio_quality: 'high' })
  assert.equal(JSON.parse(h.calls[1][4]).body.audio_quality, 'high')
  h.reply({ ok: true, data: null })
  assert.equal(await second, null)
})
test('rejects absolute, encoded and traversal paths before dispatch', async () => {
  const h = sdk()
  for (const path of [
    'https://example.com',
    '//example.com',
    '/api/../other',
    '/api/%2e%2e',
    '/api/ok#x',
    '/api/ok\\x',
    '/other/api',
  ])
    await assert.rejects(h.api.apiGet(path), /invalid/)
  assert.equal(h.calls.length, 0)
})
test('host errors, business errors and timeout reject and late replies are ignored', async () => {
  const h = sdk()
  for (const reply of [
    { ok: false, error: 'HTTP 401' },
    { ok: true, data: { error: 'cooldown' } },
  ]) {
    const p = h.api.apiGet('/api/status')
    h.reply(reply)
    await assert.rejects(p, /401|cooldown/)
  }
  const p = h.api.apiGet('/api/status'),
    timer = [...h.timers.values()][0]
  assert.equal(timer.ms, 65000)
  timer.fn()
  await assert.rejects(p, /timeout/)
  h.reply({ ok: true, data: 'late' })
})

test('PUT and DELETE preserve plugin paths and request bodies', async () => {
  const h = sdk()
  const update = h.api.apiPut('/api/config', { enabled: false })
  assert.deepEqual(JSON.parse(h.calls.at(-1)[4]), {
    method: 'PUT',
    path: '/api/config',
    body: { enabled: false },
  })
  h.reply({ ok: true, data: { saved: true } })
  assert.equal((await update).saved, true)
  const remove = h.api.apiDelete('/api/groups?id=a%2Fb')
  assert.deepEqual(JSON.parse(h.calls.at(-1)[4]), {
    method: 'DELETE',
    path: '/api/groups?id=a%2Fb',
  })
  h.reply({ ok: true, data: null })
  assert.equal(await remove, null)
  assert.equal(h.timers.size, 0)
})

test('fullscreen replies are confirmed only after a correlated successful response', async () => {
  const h = sdk()
  const video = h.bridge.invokeHost('player', 'openVideo', { id: 5 })
  const [, callId, ns, method, params] = h.calls[0]
  assert.equal(ns, 'player')
  assert.equal(method, 'openVideo')
  assert.deepEqual(JSON.parse(params), { id: 5, __songloftReplyAck: true })
  assert.equal(h.calls.length, 1)
  h.reply({ ok: true, data: null, acknowledge: true })
  assert.equal((await video).ok, true)
  await Promise.resolve()
  assert.deepEqual(h.calls[1], ['bili-frame', callId, 'lifecycle', 'hostReplyReceived', '{}'])
  assert.equal(h.timers.size, 0)
})

test('playback UI methods forward parameterless calls and reject on a host error', async () => {
  const h = sdk()
  for (const method of ['openPlayer', 'openQueue']) {
    const opened = h.player[method]()
    const [, callId, ns, name, params] = h.calls.at(-1)
    assert.deepEqual([ns, name, params], ['player', method, '{}'])
    h.reply({ ok: true, data: null, acknowledge: true })
    assert.equal(await opened, undefined)
    assert.deepEqual(h.calls.at(-1), ['bili-frame', callId, 'lifecycle', 'hostReplyReceived', '{}'])
  }

  const rejected = assert.rejects(h.player.openPlayer(), /no current song/)
  const pending = h.calls.at(-1)
  h.reply({ ok: false, error: 'no current song' })
  await rejected
  assert.equal(h.calls.at(-1), pending)
  assert.equal(h.timers.size, 0)
})
