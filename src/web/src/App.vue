<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import LearningGuide from './LearningGuide.vue'
import LoginJourney from './LoginJourney.vue'
import TraceDetails from './TraceDetails.vue'
import { journey, stageForTrace, stageIndexFromHash } from './journey'
import { parseLearningHash } from './learning'
import { actorLabels, makeTimeline, sources } from './flow'
import type { Actor, AttemptDetails, AttemptSummary, TraceStep } from './flow'
import recordedSteps from './recordings/normal.json'

const attempts = ref<AttemptSummary[]>([])
const live = ref<AttemptDetails>()
const selectedIndex = ref(0)
const notice = ref('')
const loading = ref(false)
const hash = ref(window.location.hash)
const learningRoute = computed(() => parseLearningHash(hash.value))
const view = computed(() => learningRoute.value ? 'reference' : /^#flow(?:\/|$)/.test(hash.value) ? 'flow' : 'journey')
const journeyIndex = ref(stageIndexFromHash(hash.value))
const communication = ref(false)
const backHref = ref(`#journey/${journey[journeyIndex.value]!.id}`)
const backLabel = ref('学習中の場面に戻る')
const steps = computed(() => makeTimeline(live.value?.steps ?? recordedSteps as TraceStep[]))
const selected = computed(() => steps.value[selectedIndex.value])
const selectedStage = computed(() => selected.value ? stageForTrace(selected.value.id) : undefined)
const selectedContextHref = computed(() => selectedStage.value ? `#journey/${selectedStage.value.id}` : '#journey/api')
const requestedStepMissing = computed(() => view.value === 'flow' && hash.value.split('/')[1] && !steps.value.some(step => step.id === hash.value.split('/')[1]))
const canCallResource = computed(() => live.value?.steps.some(step => step.id === 'session'))
const actors = computed<Actor[]>(() => steps.value.some(step => step.from === 'Resource API' || step.to === 'Resource API')
  ? ['Browser', 'App', 'IdP', 'Resource API']
  : ['Browser', 'App', 'IdP'])
const chartWidth = computed(() => 170 * (actors.value.length - 1) + 180)
const lane = (actor: Actor) => 90 + 170 * actors.value.indexOf(actor)
const row = (index: number) => 92 + 60 * index
const timestamp = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'medium' })

async function syncNavigation() {
  const nextHash = window.location.hash
  const previousView = view.value
  if (nextHash.startsWith('#learn') && view.value !== 'reference') {
    backHref.value = view.value === 'flow' ? `#flow/${selected.value?.id ?? ''}` : `#journey/${journey[journeyIndex.value]!.id}`
    backLabel.value = view.value === 'flow' ? '選択中の通信に戻る' : '学習中の場面に戻る'
  }
  hash.value = nextHash
  if (nextHash.startsWith('#journey') || nextHash === '#after-login') journeyIndex.value = stageIndexFromHash(nextHash)
  if (view.value === 'flow') {
    const index = steps.value.findIndex(step => step.id === nextHash.split('/')[1])
    if (index >= 0) selectedIndex.value = index
  }
  await nextTick()
  const targetId = view.value === 'reference' ? null
    : view.value === 'flow' ? (nextHash.includes('/') ? 'trace-heading' : 'flow-heading')
    : 'stage-heading'
  if (targetId) {
    const target = document.getElementById(targetId)
    target?.focus({ preventScroll: true })
    // Moving through slides should not move their title out from under the reader.
    if (previousView !== view.value || view.value === 'flow') target?.scrollIntoView({ block: 'start' })
    else if (view.value === 'journey' && target && target.getBoundingClientRect().top < 0) target.scrollIntoView({ block: 'start' })
  }
}

function observeStep(stepId: string) {
  const index = steps.value.findIndex(step => step.id === stepId)
  if (index < 0) return
  selectedIndex.value = index
  const destination = `#flow/${stepId}`
  if (window.location.hash === destination) void syncNavigation()
  else window.location.hash = destination
}

function focusContent() {
  const target = document.getElementById('main-content')
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'start' })
}

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
    if (window.location.hash.startsWith('#journey/')) {
      communication.value = true
      await syncNavigation()
    } else {
      observeStep(steps.value.some(step => step.id === 'api-browser-return') ? 'api-browser-return'
        : steps.value.some(step => step.id === 'session') ? 'session' : steps.value[0]?.id ?? '')
    }
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
  if (view.value === 'flow') observeStep('authorization-request')
}

onMounted(async () => {
  window.addEventListener('hashchange', syncNavigation)
  const id = new URLSearchParams(window.location.search).get('attempt')
  try {
    attempts.value = await getJson<AttemptSummary[]>('/api/attempts')
  } catch {
    notice.value = 'ライブ履歴を読み込めませんでした。事前記録を再生できます。'
  }
  if (id) await openAttempt(id)
  else if (window.location.hash) await syncNavigation()
})

onBeforeUnmount(() => window.removeEventListener('hashchange', syncNavigation))
</script>

<template>
  <a class="skip-link" href="#main-content" @click.prevent="focusContent">本文へ移動</a>
  <header class="masthead">
    <div class="masthead-inner">
      <a class="brand" href="#journey"><strong>OIDC Lens</strong><span>ログインの仕組みを理解する</span></a>
      <a class="header-login" href="/my-data">データを見る →</a>
    </div>
  </header>

  <main id="main-content" tabindex="-1">
    <nav v-if="view !== 'journey'" class="support-navigation" aria-label="学習と補助資料">
      <a :href="`#journey/${journey[journeyIndex]!.id}`">← 学習中の場面に戻る</a>
      <a v-if="view !== 'flow'" href="#flow">通信記録を調べる</a>
      <a v-if="view !== 'reference'" href="#learn/glossary">用語辞典・参考解説</a>
    </nav>
    <LoginJourney v-if="view === 'journey'" v-model:communication="communication" :stage-index="journeyIndex" :steps="steps" :recording="!live" @reselect="syncNavigation" />
    <LearningGuide v-if="learningRoute" :route="learningRoute" :available-steps="steps.map(step => step.id)" :back-href="backHref" :back-label="backLabel" @observe="observeStep" />

    <div v-show="view === 'flow'">
    <section class="intro">
      <p class="eyebrow">仕組みを、実際のやり取りで確かめる</p>
      <h1 id="flow-heading" tabindex="-1">通信記録を調べる</h1>
      <p>ログインからAPIの利用まで、アプリで採取した通信記録をまとめて確認できます。</p>
      <a class="learning-invitation" :href="selectedContextHref">{{ selectedStage ? 'この通信が、ログイン全体で果たす役割を見る' : 'ログイン後のAPI利用との関係を見る' }} →</a>
    </section>

    <div class="toolbar">
      <div class="record-label">
        <span class="indicator" :class="{ live: live }"></span>
        <strong>{{ live ? 'ライブ試行' : '正常系の事前記録' }}</strong>
        <small v-if="live">{{ timestamp.format(new Date(live.startedAt)) }}</small>
      </div>
      <div class="toolbar-actions">
        <a v-if="canCallResource" class="plain-button" href="/my-data">同じデータをもう一度見る</a>
        <button class="plain-button" type="button" :disabled="loading || !live" @click="showRecording">
          事前記録を開く
        </button>
        <label v-if="attempts.length">
          <span class="sr-only">ライブ試行を選ぶ</span>
          <select
            :value="live?.id ?? ''" :disabled="loading"
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
    <p v-if="requestedStepMissing" class="notice" role="status">指定されたステップはこの試行では未観測です。下には取得済みの記録を表示しています。</p>

    <div class="workspace">
      <nav class="panel steps" aria-label="フローのステップ">
        <div class="panel-heading"><h2>ステップ</h2><span>{{ steps.length }}</span></div>
        <ol>
          <li v-for="(step, index) in steps" :key="step.id">
            <button type="button" :aria-current="index === selectedIndex ? 'step' : undefined" @click="observeStep(step.id)">
              <span class="step-number">{{ String(index + 1).padStart(2, '0') }}</span>
              <span>{{ step.title }}<small>{{ sources[step.source] }}</small></span>
            </button>
          </li>
        </ol>
        <div class="step-controls">
          <button class="plain-button" type="button" :disabled="selectedIndex === 0" @click="observeStep(steps[selectedIndex - 1]!.id)">← 前へ</button>
          <button class="plain-button" type="button" :disabled="selectedIndex >= steps.length - 1" @click="observeStep(steps[selectedIndex + 1]!.id)">次へ →</button>
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
              <rect :x="lane(actor) - 70" y="9" width="140" height="31" rx="7"/>
              <text :x="lane(actor)" y="29" text-anchor="middle">{{ actorLabels[actor] }}</text>
              <line :x1="lane(actor)" :x2="lane(actor)" y1="41" :y2="row(steps.length) - 28"/>
            </g>
            <g
              v-for="(step, index) in steps" :key="step.id" class="diagram-step" :class="[step.channel, { selected: index === selectedIndex }]"
              role="button" tabindex="0" :aria-label="step.title" :aria-pressed="index === selectedIndex"
              @click="observeStep(step.id)" @keydown.enter.prevent="observeStep(step.id)" @keydown.space.prevent="observeStep(step.id)"
            >
              <rect class="step-highlight" x="8" :y="row(index) - 34" :width="chartWidth - 16" height="55" rx="8"/>
              <text x="19" :y="row(index) + 4" class="row-number">{{ String(index + 1).padStart(2, '0') }}</text>
              <circle v-if="step.from === step.to" :cx="lane(step.from)" :cy="row(index)" r="5"/>
              <line
                v-else :x1="lane(step.from)" :x2="lane(step.to)" :y1="row(index)" :y2="row(index)"
                :marker-end="`url(#${step.channel}-arrow)`"
              />
              <text :x="(lane(step.from) + lane(step.to)) / 2" :y="row(index) - 11" text-anchor="middle">
                {{ step.diagramLabel }}{{ step.status ? ` · ${step.status}` : '' }}
              </text>
            </g>
          </svg>
        </div>
      </section>

      <aside class="panel details" aria-label="選択中のステップの詳細">
        <div class="panel-heading"><h2 id="trace-heading" tabindex="-1">選択中の通信</h2></div>
        <div v-if="selected" class="details-inner">
          <a :href="selectedContextHref">{{ selectedStage ? `場面${journey.indexOf(selectedStage) + 1}の理由に戻る` : 'ログイン後の説明に戻る' }} →</a>
          <TraceDetails :step="selected" :recording="!live" />
        </div>
        <p v-else class="details-inner">この試行で観測したステップはまだありません。</p>
      </aside>
    </div>
    </div>
  </main>
</template>
