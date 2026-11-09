import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { makeTimeline } from '../src/flow.ts'
import { chapters, glossary, parseLearningHash, references, termForField, termsForStep, walkthrough } from '../src/learning.ts'

test('learning deep links accept known chapters and terms and safely handle unknown hashes', () => {
  assert.equal(parseLearningHash('#flow'), null)
  assert.equal(parseLearningHash('#learned'), null)
  assert.deepEqual(parseLearningHash('#learn'), { chapter: 'basics', term: undefined })
  assert.deepEqual(parseLearningHash('#learn/tokens'), { chapter: 'tokens', term: undefined })
  assert.deepEqual(parseLearningHash('#learn/glossary/nonce'), { chapter: 'glossary', term: 'nonce' })
  assert.deepEqual(parseLearningHash('#learn/unknown'), { chapter: 'basics', term: undefined })
  assert.deepEqual(parseLearningHash('#learn/glossary/%broken'), { chapter: 'glossary', term: undefined })
})

test('the recorded HTTP fields and token claims all have working glossary destinations', () => {
  const recording = JSON.parse(readFileSync(new URL('../src/recordings/normal.json', import.meta.url), 'utf8'))
  const ids = new Set(glossary.map(term => term.id))
  for (const step of recording) {
    for (const fields of [step.request, step.response, step.idToken?.header, step.idToken?.payload]) {
      for (const field of Object.keys(fields ?? {})) {
        assert.ok(ids.has(termForField(field)), `Missing explanation for ${field}`)
      }
    }
  }
  assert.equal(termForField('unknown_field'), undefined)
  for (const term of glossary) assert.ok(references[term.source], `Missing source for ${term.id}`)
})

test('walkthrough links resolve to observable steps and every step offers context', () => {
  const recording = JSON.parse(readFileSync(new URL('../src/recordings/normal.json', import.meta.url), 'utf8'))
  const timeline = makeTimeline(recording)
  for (const item of walkthrough) assert.ok(timeline.some(step => step.id === item.step), item.step)
  for (const step of timeline) assert.ok(termsForStep(step.id).length, `Missing context for ${step.id}`)
  assert.deepEqual(termsForStep('unknown-step'), [])
  const component = readFileSync(new URL('../src/LearningGuide.vue', import.meta.url), 'utf8')
  for (const [, hash] of component.matchAll(/href="(#learn\/[^"]+)"/g)) {
    const route = parseLearningHash(hash)
    assert.ok(chapters.some(chapter => chapter.id === route.chapter), hash)
    if (hash.startsWith('#learn/glossary/')) assert.ok(route.term, `Broken term link: ${hash}`)
  }
})
