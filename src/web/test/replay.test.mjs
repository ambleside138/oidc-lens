import assert from 'node:assert/strict'
import test from 'node:test'
import { makeReplay, parseReplayHash, questions } from '../src/replay.ts'
import { makeSequenceWindow } from '../src/sequence.ts'

const body = wire => wire.split('\n\n').slice(1).join('\n\n')
const json = wire => JSON.parse(body(wire))
const steps = makeReplay()
const get = id => steps.find(step => step.id === id)
const http = (id, kind) => get(id).logs.find(log => log.kind === kind)

test('OIDC HTTP request lines, URL headers, form bodies and JSON are coherent', () => {
  for (const log of steps.flatMap(step => step.logs)) {
    if (log.kind === 'request') {
      assert.match(log.wire.split('\n')[0], /^(GET|POST) \/\S+ HTTP\/1\.1$/)
      assert.match(log.wire, /\nHost: \S+(?:\n|$)/)
    }
    if (log.kind === 'response') assert.match(log.wire.split('\n')[0], /^HTTP\/1\.1 (200|302|401) /)
    if (/Content-Type: application\/x-www-form-urlencoded/.test(log.wire)) assert.ok(!body(log.wire).includes('\n'))
    if (/Content-Type: application\/json/.test(log.wire)) assert.doesNotThrow(() => json(log.wire))
    if (log.wire.includes('\nLocation: ')) {
      assert.ok(URL.canParse(log.wire.match(/\nLocation: (\S+)/)[1]))
      assert.ok(!log.wire.includes('\n  &'))
    }
  }
})

test('state, code, scopes, token and cookie survive their handoffs', () => {
  const auth = new URL(http('authorize', 'response').wire.match(/Location: (\S+)/)[1]).searchParams
  const callback = new URL(http('callback', 'request').wire.split(' ')[1], 'https://app.example').searchParams
  const tokenRequest = new URLSearchParams(body(http('token', 'request').wire))
  const tokens = json(http('token', 'response').wire)
  const introspection = json(http('resource', 'response').wire)
  assert.equal(callback.get('state'), auth.get('state'))
  assert.equal(callback.get('code'), tokenRequest.get('code'))
  assert.equal(tokenRequest.get('redirect_uri'), auth.get('redirect_uri'))
  assert.equal(tokens.scope, auth.get('scope'))
  assert.equal(introspection.scope, tokens.scope)
  assert.ok(http('api', 'request').wire.includes(`Authorization: Bearer ${tokens.access_token}`))
  assert.equal(new URLSearchParams(body(http('resource', 'request').wire)).get('token'), tokens.access_token)
  const cookie = http('session', 'response').wire.match(/Set-Cookie: (app_session=[^;]+)/)[1]
  assert.ok(http('browser-session', 'request').wire.includes(`Cookie: ${cookie}`))
})

test('callback and page responses wait for nested server work; tokens stay server-side', () => {
  const ids = steps.map(step => step.id)
  assert.ok(ids.indexOf('callback') < ids.indexOf('token'))
  assert.ok(ids.indexOf('token') < ids.indexOf('validate'))
  assert.ok(ids.indexOf('validate') < ids.indexOf('session'))
  assert.equal(get('callback').logs.filter(log => log.kind === 'response').length, 0)
  assert.equal(http('session', 'response').to, 'browser')
  assert.equal(get('api').logs.filter(log => log.kind === 'response').length, 0)
  assert.equal(get('resource').logs.at(-1).to, 'client')
  assert.equal(http('complete', 'response').to, 'browser')
  for (const log of steps.flatMap(step => step.logs).filter(log => log.to === 'browser' && log.kind === 'response')) {
    assert.ok(!log.wire.includes('at_demo_01'))
    assert.ok(!log.wire.includes('idt_demo_01'))
  }
})

test('the sole flow requests and verifies OIDC identity before establishing login', () => {
  const auth = new URL(http('authorize', 'response').wire.match(/Location: (\S+)/)[1]).searchParams
  assert.ok(auth.get('scope').split(' ').includes('openid'))
  assert.ok(auth.get('nonce'))
  assert.ok(json(http('token', 'response').wire).id_token)
  const verification = get('validate').logs.at(-1).wire
  for (const field of ['signature: PASS', 'iss =', 'aud includes', 'now=', 'nonce = saved']) assert.ok(verification.includes(field))
  assert.ok(http('complete', 'response').wire.includes('ログイン済み'))
})

test('deep links and review destinations use the sole OIDC flow, including old OAuth bookmarks', () => {
  steps.forEach((step, index) => {
    assert.deepEqual(parseReplayHash(`#/oidc/${step.id}`), { index })
    assert.deepEqual(parseReplayHash(`#/oauth/${step.id}`), { index })
  })
  for (const question of questions) assert.ok(steps.some(step => step.id === question.step))
  for (const hash of ['', '#/oidc/missing', '#/bad/api', '#main-content']) assert.deepEqual(parseReplayHash(hash), { index: 0 })
})

test('sequence diagram shows every selected log in order, with only the actual adjacent context', () => {
  steps.forEach((step, index) => {
    const diagram = makeSequenceWindow(steps, index)
    assert.deepEqual(diagram.groups.map(group => group.index), [index - 1, index, index + 1].filter(value => value >= 0 && value < steps.length))
    const selected = diagram.groups.find(group => group.current)
    assert.deepEqual(selected.events.map(event => event.log), step.logs)
    assert.deepEqual(selected.events.map(event => event.logIndex), step.logs.map((_, i) => i))
    for (const group of diagram.groups.filter(group => !group.current)) {
      assert.equal(group.events.length, 1)
      assert.equal(group.events[0].log.kind === 'internal', false)
      const candidates = steps[group.index].logs.filter(log => log.kind !== 'internal')
      assert.equal(group.events[0].log, group.index < index ? candidates.at(-1) : candidates[0])
    }
    assert.ok(diagram.groups.at(-1).y + diagram.groups.at(-1).height < diagram.height)
  })
})

test('code exchange diagram preserves who sends code and who returns the tokens', () => {
  const index = steps.findIndex(step => step.id === 'token')
  const current = makeSequenceWindow(steps, index).groups.find(group => group.current)
  assert.deepEqual(current.events.map(event => [event.log.from, event.log.to, event.label]), [
    ['client', 'provider', 'POST /token'],
    ['provider', 'provider', '内部処理'],
    ['provider', 'client', '200 OK'],
  ])
})
