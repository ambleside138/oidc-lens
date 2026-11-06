<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { channels, makeTimeline, sources } from './flow'
import type { Actor, AttemptDetails, AttemptSummary, TraceStep } from './flow'
import recordedSteps from './recordings/normal.json'

const attempts = ref<AttemptSummary[]>([])
const live = ref<AttemptDetails>()
const selectedIndex = ref(0)
const notice = ref('')
const loading = ref(false)
const callingResource = ref(false)
const steps = computed(() => makeTimeline(live.value?.steps ?? recordedSteps as TraceStep[]))
const selected = computed(() => steps.value[selectedIndex.value])
const canCallResource = computed(() => live.value?.steps.some(step => step.id === 'session'))
const actors = computed<Actor[]>(() => steps.value.some(step => step.from === 'Resource API' || step.to === 'Resource API')
  ? ['Browser', 'App', 'IdP', 'Resource API']
  : ['Browser', 'App', 'IdP'])
const chartWidth = computed(() => 170 * (actors.value.length - 1) + 180)
const lane = (actor: Actor) => 90 + 170 * actors.value.indexOf(actor)
const row = (index: number) => 92 + 60 * index
const fieldLabels: Record<string, string> = { present: 'あり · 値をマスク', absent: 'なし' }
const formatValue = (value: string) => fieldLabels[value] ?? value
const timestamp = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'medium' })

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(String(response.status))
  return response.json() as Promise<T>
}

function updateUrl(id: string | null) {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('attempt', id)
  else url.searchParams.delete('attempt')
  window.history.replaceState(null, '', url)
}

async function openAttempt(id: string) {
  loading.value = true
  try {
    live.value = await getJson<AttemptDetails>(`/api/attempts/${encodeURIComponent(id)}`)
    selectedIndex.value = 0
    notice.value = ''
    updateUrl(id)
  } catch {
    showRecording()
    notice.value = 'この試行の履歴を開けませんでした。事前記録を表示しています。'
  } finally {
    loading.value = false
  }
}

function showRecording() {
  live.value = undefined
  selectedIndex.value = 0
  notice.value = ''
  updateUrl(null)
}

async function callResource() {
  if (!live.value) return
  const attempt = live.value.id
  const url = `/api/attempts/${encodeURIComponent(attempt)}`
  callingResource.value = true
  notice.value = ''
  try {
    const response = await fetch(`${url}/resource`, {
      method: 'POST',
      headers: { 'X-Oidc-Lens': 'workshop' },
    })
    live.value = await getJson<AttemptDetails>(url)
    const lastStep = steps.value.findIndex(step => step.id === 'api-browser-return')
    if (lastStep >= 0) selectedIndex.value = lastStep
    if (!response.ok) {
      notice.value = response.status === 409 || (response.status === 401 && lastStep < 0)
        ? 'この試行から API を呼ぶには、もう一度ログインしてください。'
        : `保護 API の呼び出しで HTTP ${response.status} が返りました。`
    }
  } catch {
    notice.value = '保護 API の呼び出し結果を読み込めませんでした。'
  } finally {
    callingResource.value = false
  }
}

onMounted(async () => {
  const id = new URLSearchParams(window.location.search).get('attempt')
  try {
    attempts.value = await getJson<AttemptSummary[]>('/api/attempts')
  } catch {
    notice.value = 'ライブ履歴を読み込めませんでした。事前記録を再生できます。'
  }
  if (id) await openAttempt(id)
})
</script>

<template>
  <header class="masthead">
    <div class="masthead-inner">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">◈</span>
        <div><strong>OIDC Lens</strong><small>認証フローを観察する</small></div>
      </div>
      <a class="primary-button" href="/auth/login">Keycloak でログイン <span aria-hidden="true">↗</span></a>
    </div>
  </header>

  <main>
    <section class="intro">
      <p class="eyebrow">OPENID CONNECT WORKSHOP</p>
      <h1>ログインの裏側をたどる</h1>
      <p>ブラウザ、アプリ、Keycloak の間で何が渡るか、矢印を選んで確かめましょう。</p>
    </section>

    <div class="toolbar">
      <div class="record-label">
        <span class="indicator" :class="{ live: live }"></span>
        <strong>{{ live ? 'ライブ試行' : '正常系の事前記録' }}</strong>
        <small v-if="live">{{ timestamp.format(new Date(live.startedAt)) }}</small>
      </div>
      <div class="toolbar-actions">
        <button
          v-if="canCallResource" class="plain-button call-api" type="button"
          :disabled="loading || callingResource" @click="callResource"
        >{{ callingResource ? '呼び出し中…' : '保護 API を呼ぶ' }}</button>
        <button class="plain-button" type="button" :disabled="loading || callingResource || !live" @click="showRecording">
          事前記録を開く
        </button>
        <label v-if="attempts.length">
          <span class="sr-only">ライブ試行を選ぶ</span>
          <select
            :value="live?.id ?? ''" :disabled="loading || callingResource"
            @change="openAttempt(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>ライブ履歴を選択</option>
            <option v-for="attempt in attempts" :key="attempt.id" :value="attempt.id">
              {{ timestamp.format(new Date(attempt.startedAt)) }} · {{ attempt.id.slice(0, 6) }}
            </option>
          </select>
        </label>
      </div>
    </div>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>

    <div class="workspace">
      <nav class="panel steps" aria-label="フローのステップ">
        <div class="panel-heading"><h2>ステップ</h2><span>{{ steps.length }}</span></div>
        <ol>
          <li v-for="(step, index) in steps" :key="step.id">
            <button type="button" :aria-current="index === selectedIndex ? 'step' : undefined" @click="selectedIndex = index">
              <span class="step-number">{{ String(index + 1).padStart(2, '0') }}</span>
              <span>{{ step.title }}<small>{{ sources[step.source] }}</small></span>
            </button>
          </li>
        </ol>
        <div class="step-controls">
          <button class="plain-button" type="button" :disabled="selectedIndex === 0" @click="selectedIndex--">← 前へ</button>
          <button class="plain-button" type="button" :disabled="selectedIndex >= steps.length - 1" @click="selectedIndex++">次へ →</button>
        </div>
      </nav>

      <section class="panel diagram" aria-labelledby="diagram-heading">
        <div class="panel-heading"><h2 id="diagram-heading">シーケンス図</h2></div>
        <div class="legend">
          <span><i class="line-sample front"></i>フロントチャネル</span>
          <span><i class="line-sample back"></i>バックチャネル</span>
          <span><i class="dot-sample"></i>内部処理</span>
        </div>
        <div class="diagram-scroll">
          <svg :viewBox="`0 0 ${chartWidth} ${row(steps.length) - 26}`" aria-label="通信を選べるシーケンス図">
            <defs>
              <marker id="front-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 Z" fill="#275786"/>
              </marker>
              <marker id="back-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 Z" fill="#077366"/>
              </marker>
            </defs>
            <g v-for="actor in actors" :key="actor" class="actor">
              <rect :x="lane(actor) - 55" y="9" width="110" height="31" rx="7"/>
              <text :x="lane(actor)" y="29" text-anchor="middle">{{ actor }}</text>
              <line :x1="lane(actor)" :x2="lane(actor)" y1="41" :y2="row(steps.length) - 28"/>
            </g>
            <g
              v-for="(step, index) in steps" :key="step.id" class="diagram-step" :class="[step.channel, { selected: index === selectedIndex }]"
              role="button" tabindex="0" :aria-label="step.title" :aria-pressed="index === selectedIndex"
              @click="selectedIndex = index" @keydown.enter.prevent="selectedIndex = index" @keydown.space.prevent="selectedIndex = index"
            >
              <rect class="step-highlight" x="8" :y="row(index) - 34" :width="chartWidth - 16" height="55" rx="8"/>
              <text x="19" :y="row(index) + 4" class="row-number">{{ String(index + 1).padStart(2, '0') }}</text>
              <circle v-if="step.from === step.to" :cx="lane(step.from)" :cy="row(index)" r="5"/>
              <line
                v-else :x1="lane(step.from)" :x2="lane(step.to)" :y1="row(index)" :y2="row(index)"
                :marker-end="`url(#${step.channel}-arrow)`"
              />
              <text :x="(lane(step.from) + lane(step.to)) / 2" :y="row(index) - 11" text-anchor="middle">
                {{ step.method ?? (step.source === 'lesson' ? '教材' : '認証処理') }}{{ step.status ? ` · ${step.status}` : '' }}
              </text>
            </g>
          </svg>
        </div>
      </section>

      <aside class="panel details" aria-label="選択中のステップの詳細">
        <div class="panel-heading"><h2>通信の詳細</h2></div>
        <div v-if="selected" class="details-inner" aria-live="polite">
          <div class="tags"><span>{{ sources[selected.source] }}</span><span>{{ channels[selected.channel] }}</span></div>
          <h3>{{ selected.title }}</h3>
          <p>{{ selected.description }}</p>
          <dl class="fields">
            <div><dt>観測地点</dt><dd>{{ selected.source === 'lesson' ? '教材の説明' : 'BFF' }}</dd></div>
            <div><dt>経路</dt><dd>{{ selected.from }} → {{ selected.to }}</dd></div>
            <div v-if="selected.method"><dt>Method</dt><dd><code>{{ selected.method }}</code></dd></div>
            <div v-if="selected.url"><dt>URL</dt><dd><code>{{ selected.url }}</code></dd></div>
            <div v-if="selected.status"><dt>Status</dt><dd><code>{{ selected.status }}</code></dd></div>
          </dl>
          <template v-for="(fields, label) in { Request: selected.request, Response: selected.response }" :key="label">
            <section v-if="fields && Object.keys(fields).length" class="field-group">
              <h4>{{ label }}</h4>
              <dl class="fields">
                <div v-for="(value, key) in fields" :key="key">
                  <dt><code>{{ key }}</code></dt><dd><code>{{ formatValue(value) }}</code></dd>
                </div>
              </dl>
            </section>
          </template>
          <section v-if="selected.idToken" class="inspector" aria-label="ID Token Inspector">
            <h3>ID Token Inspector</h3>
            <p>デコードした項目を表示しています。</p>
            <section v-for="(fields, label) in { Header: selected.idToken.header, Payload: selected.idToken.payload }" :key="label">
              <h4>{{ label }}</h4>
              <dl class="fields">
                <div v-for="(value, key) in fields" :key="key">
                  <dt><code>{{ key }}</code></dt><dd><code>{{ formatValue(value) }}</code></dd>
                </div>
              </dl>
            </section>
            <div class="validation-result">
              <h4>認証処理の結果</h4>
              <p>{{ selected.idToken.result === 'session-established' ? 'ID Token を検証し、セッションを確立しました。' : '判定未取得' }}</p>
            </div>
          </section>
        </div>
        <p v-else class="details-inner">この試行で観測したステップはまだありません。</p>
      </aside>
    </div>
  </main>
</template>
