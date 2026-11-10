import assert from 'node:assert/strict'
import test from 'node:test'
import { liveSteps, liveIndex, nextAction, phaseLabel } from '../src/live.ts'
import { makeSequenceWindow } from '../src/sequence.ts'

test('unexecuted live stages have no manufactured requests, responses or sequence arrows', () => {
  const steps = liveSteps(null)
  assert.equal(steps.length, 7)
  for (const step of steps) assert.deepEqual(step.logs, [])
  for (let index = 0; index < steps.length; index++) {
    assert.ok(makeSequenceWindow(steps, index).groups.every(group => group.events.length === 0))
  }
})

test('received code is displayed without manufacturing a token exchange or login', () => {
  const log = { stepId: 'callback', from: 'browser', to: 'client', kind: 'request', label: 'コード受領', wire: 'GET /auth/lab/callback HTTP/1.1\nHost: localhost:7443', recordedAt: '2026-11-11T00:00:00Z' }
  const attempt = { id: 'demo', phase: 'code-received', logs: [log], expiresAt: '', error: null, nextRequest: '', resourceMessage: null }
  const steps = liveSteps(attempt)
  assert.equal(steps.find(step => step.id === 'callback').logs[0].wire, log.wire)
  assert.equal(steps.find(step => step.id === 'callback').logs[0].recordedAt, log.recordedAt)
  for (const id of ['token', 'validate', 'session', 'api']) assert.deepEqual(steps.find(step => step.id === id).logs, [])
  assert.equal(nextAction(attempt.phase).id, 'token')
  assert.equal(attempt.logs.length, 1)
})

test('each successful boundary exposes exactly one next command; failure never offers continuation', () => {
  for (const [phase, id] of [['prepared','authorize'],['code-received','token'],['tokens-received','validate'],['validated','session'],['session-established','api']]) {
    assert.equal(nextAction(phase).id, id)
  }
  for (const phase of [undefined, 'authorizing', 'failed', 'complete']) assert.equal(nextAction(phase), null)
  assert.ok(phaseLabel('tokens-received').includes('検証前'))
  assert.ok(phaseLabel('validated').includes('Cookie発行前'))
})

test('live navigation is bounded and has stable destinations for all real stages', () => {
  liveSteps(null).forEach((step, index) => assert.equal(liveIndex(`#/lab/${step.id}`), index))
  for (const hash of ['', '#/lab/not-found']) assert.equal(liveIndex(hash), 0)
})
