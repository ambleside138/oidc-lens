import assert from 'node:assert/strict'
import test from 'node:test'
import { makeTimeline } from '../src/flow.ts'

test('teaching arrows explain observed steps without being labeled as HTTP', () => {
  const redirect = { id: 'authorization-request', source: 'http', from: 'App', to: 'Browser', status: 302 }
  const callback = { id: 'callback', source: 'http', from: 'Browser', to: 'App', method: 'POST' }
  const timeline = makeTimeline([callback, redirect])

  assert.deepEqual(timeline.map(step => step.id), [
    'authorization-request', 'browser-navigation', 'user-authentication', 'idp-response', 'callback',
  ])
  assert.deepEqual(timeline.map(step => step.source), ['http', 'lesson', 'lesson', 'lesson', 'http'])
  assert.equal(timeline[0].status, 302)
  assert.equal(timeline[4].method, 'POST')
})

test('a token exchange does not imply that the app established a session', () => {
  const token = { id: 'token-http', source: 'http', from: 'App', to: 'IdP', status: 200 }
  const timeline = makeTimeline([token])
  assert.deepEqual(timeline.map(step => step.id), ['token-http', 'token-return'])
  assert.equal(timeline[1].source, 'http')
  assert.equal(timeline[1].status, 200)
  assert.equal(timeline[1].from, 'IdP')
  assert.deepEqual(makeTimeline([{ ...token, status: null }]).map(step => step.id), ['token-http'])
})
