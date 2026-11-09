import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('the offline recording follows login through the protected API', () => {
  const recording = JSON.parse(readFileSync(new URL('../src/recordings/normal.json', import.meta.url), 'utf8'))
  const timeline = makeTimeline(recording)
  const session = timeline.find(step => step.id === 'session')
  assert.equal(session.idToken.result, 'session-established')
  assert.equal(session.idToken.payload.sub, 'present')
  assert.deepEqual(timeline.slice(-4).map(({ id, channel, from, to, status }) =>
    [id, channel, from, to, status]), [
    ['api-browser', 'front', 'Browser', 'App', null],
    ['api-resource', 'back', 'App', 'Resource API', null],
    ['resource-return', 'back', 'Resource API', 'App', 200],
    ['api-browser-return', 'front', 'App', 'Browser', 200],
  ])
})

test('the recording starts and finishes at the same data URL using the application Cookie', () => {
  const recording = JSON.parse(readFileSync(new URL('../src/recordings/normal.json', import.meta.url), 'utf8'))
  const first = recording.find(step => step.id === 'resource-request')
  const retry = recording.find(step => step.id === 'api-browser')
  assert.equal(first.method, 'GET')
  assert.equal(first.url, '/my-data')
  assert.equal(first.request.Cookie, 'absent')
  assert.equal(retry.method, 'GET')
  assert.equal(retry.url, first.url)
  assert.equal(retry.request.Cookie, 'present')
  assert.equal(retry.status, 200)
  const timeline = makeTimeline(recording)
  assert.equal(timeline[0].id, 'resource-request')
  assert.ok(timeline.findIndex(step => step.id === 'session') < timeline.findIndex(step => step.id === 'api-browser'))
})
