import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { journey, stageForTrace, stageIndexFromHash, tracesForStage } from '../src/journey.ts'
import { makeTimeline } from '../src/flow.ts'
import { glossary } from '../src/learning.ts'

test('each recorded event belongs to one scene, with cookies and API access after login', () => {
  const recording = JSON.parse(readFileSync(new URL('../src/recordings/normal.json', import.meta.url), 'utf8'))
  const timeline = makeTimeline(recording)
  assert.deepEqual(journey.flatMap(stage => tracesForStage(stage, timeline)).map(step => step.id), timeline.map(step => step.id))
  assert.equal(stageForTrace('callback').id, 'code')
  assert.equal(stageForTrace('session').id, 'accept')
  assert.equal(stageForTrace('api-resource').id, 'api')
  assert.equal(stageForTrace('api-browser').id, 'continue')
  assert.ok(journey.findIndex(stage => stage.id === 'accept') < journey.findIndex(stage => stage.id === 'cookie'))
  assert.ok(journey.findIndex(stage => stage.id === 'cookie') < journey.findIndex(stage => stage.id === 'continue'))
  assert.equal(stageForTrace('unknown'), undefined)
  for (const stage of journey) {
    assert.equal(journey[stageIndexFromHash(`#journey/${stage.id}`)], stage)
    for (const id of stage.terms) assert.ok(glossary.some(term => term.id === id), `Missing glossary entry: ${id}`)
  }
})

test('progressing a lesson cannot manufacture a successful live authentication record', () => {
  const partial = makeTimeline([{ id: 'token-http', source: 'http', from: 'App', to: 'IdP', status: 400 }])
  assert.equal(tracesForStage(journey.find(stage => stage.id === 'tokens'), partial).length, 2)
  assert.deepEqual(tracesForStage(journey.find(stage => stage.id === 'accept'), partial), [])
  assert.deepEqual(tracesForStage(journey.find(stage => stage.id === 'cookie'), partial), [])
  assert.equal(partial[1].diagramLabel, 'トークン応答')
})

test('invalid or incomplete journey links have a usable starting point', () => {
  for (const hash of ['', '#journey', '#journey/unknown', '#journey/%broken']) {
    assert.equal(stageIndexFromHash(hash), 0)
  }
  assert.equal(journey[stageIndexFromHash('#after-login')].id, 'cookie')
})
