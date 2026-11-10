<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FlowStep } from './flow'
import { journey, tracesForStage } from './journey'
import type { JourneyActor, JourneyMessage } from './journey'
import InlineTerm from './InlineTerm.vue'
import TraceDetails from './TraceDetails.vue'
import { references } from './learning'

const props = defineProps<{ stageIndex: number; steps: FlowStep[]; recording: boolean; communication: boolean }>()
const emit = defineEmits<{ 'update:communication': [value: boolean]; reselect: [] }>()
const stage = computed(() => journey[props.stageIndex]!)
const previous = computed(() => journey[props.stageIndex - 1])
const next = computed(() => journey[props.stageIndex + 1])
const traces = computed(() => tracesForStage(stage.value, props.steps))
const selectedTrace = ref('')
const trace = computed(() => traces.value.find(item => item.id === selectedTrace.value) ?? traces.value[0])
const showOverview = ref(false)
watch(() => props.stageIndex, () => { selectedTrace.value = ''; showOverview.value = false })
const actors: { id: JourneyActor; name: string; role: string }[] = [
  { id: 'browser', name: '利用者', role: 'ブラウザ' },
  { id: 'app', name: 'アプリ', role: 'APIを利用するクライアント' },
  { id: 'provider', name: '認証サービス', role: '本人確認を任せる相手' },
  { id: 'api', name: 'リソースAPI', role: 'データを守るリソースサーバー' },
]
const lane = (actor: JourneyActor) => 100 + actors.findIndex(item => item.id === actor) * 200
function messagePath(message: JourneyMessage) {
  const start = lane(message.from)
  const end = lane(message.to)
  if (message.via) return `M${start} 23 H${lane(message.via)} H${end}`
  return start === end ? `M${start} 9 H${start + 48} V33 H${start}` : `M${start} 23 H${end}`
}
function revisit(event: MouseEvent, id: string) {
  if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && window.location.hash === `#journey/${id}`) {
    event.preventDefault()
    emit('reselect')
  }
}
function replay() {
  emit('update:communication', true)
  window.location.hash = `#journey/${journey[0]!.id}`
}
</script>

<template>
  <div class="slide-journey">
    <div class="journey-topline">
      <p id="journey-heading" class="journey-caption" tabindex="-1">OIDCの全体像と、ログインの仕組みをたどる</p>
      <label class="communication-switch"><input type="checkbox" :checked="communication" aria-controls="journey-communication" @change="emit('update:communication', ($event.target as HTMLInputElement).checked)">通信を表示</label>
    </div>
    <div class="slide-layout" :class="{ 'with-communication': communication }">
      <section class="lesson-slide" aria-labelledby="stage-heading">
        <header class="slide-title">
          <p class="slide-position"><span class="slide-count">{{ String(stageIndex + 1).padStart(2, '0') }} / {{ String(journey.length).padStart(2, '0') }}</span><span>{{ stage.chapter }}</span><span class="slide-scene-name">{{ stage.title }}</span></p>
          <h1 id="stage-heading" tabindex="-1">{{ stage.question }}</h1>
        </header>
        <div v-if="stage.panels" class="concept-panels" aria-label="規格の要点">
          <section v-for="panel in stage.panels" :key="panel.title" class="concept-panel">
            <h2>{{ panel.title }}</h2>
            <dl><div v-for="item in panel.items" :key="item.label">
              <dt><a v-if="item.stageId" :href="`#journey/${item.stageId}`">{{ item.label }}</a><span v-else>{{ item.label }}</span></dt>
              <dd>{{ item.text }}</dd>
            </div></dl>
          </section>
        </div>
        <figure v-else class="slide-diagram" :aria-label="stage.messages.map(message => message.label).join('。')">
          <div class="slide-actors">
            <div v-for="actor in actors" :key="actor.id" class="slide-actor" :class="{ 'actor-muted': !stage.messages.some(message => message.from === actor.id || message.to === actor.id) }">
              <svg v-if="actor.id === 'browser'" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="9" r="5"/><path d="M6 28v-4a10 10 0 0 1 20 0v4"/></svg>
              <svg v-else-if="actor.id === 'provider'" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3L28 8v9c0 7-12 12-12 12S4 24 4 17V8Z"/><path d="M10 16l4 4 8-9"/></svg>
              <svg v-else viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="5" width="26" height="22" rx="3"/><path d="M3 12h26M8 9h1M12 9h1"/></svg>
              <strong>{{ actor.name }}</strong><small>{{ actor.role }}</small>
            </div>
          </div>
          <div class="slide-messages">
            <div class="slide-lanes" aria-hidden="true"><span v-for="actor in actors" :key="actor.id"></span></div>
            <div v-for="(message, index) in stage.messages" :key="`${stage.id}-${index}`" class="slide-message">
              <p :style="{ '--message-center': `${(lane(message.from) + lane(message.to)) / 16}%` }">{{ message.label }}</p>
              <svg viewBox="0 0 800 46" preserveAspectRatio="none" aria-hidden="true">
                <defs><marker :id="`slide-arrow-${index}`" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z"/></marker></defs>
                <path class="slide-arrow-line" :d="messagePath(message)" :marker-mid="message.via ? `url(#slide-arrow-${index})` : undefined" :marker-end="`url(#slide-arrow-${index})`"/>
              </svg>
            </div>
          </div>
          <figcaption class="sr-only">{{ stage.messages.map(message => `${actors.find(actor => actor.id === message.from)?.name}から${actors.find(actor => actor.id === message.to)?.name}へ。${message.label}`).join('。') }}</figcaption>
        </figure>
        <div class="slide-explanation" aria-live="polite">
          <p class="slide-answer">{{ stage.answer }}</p>
          <p>{{ stage.explanation }}</p>
          <p v-if="stage.panels" class="support-text"><a :href="references.core.url" target="_blank" rel="noreferrer">出典：OpenID Connect Core 1.0（英語）</a></p>
          <p v-if="stage.id === 'api'" class="token-recall">「鍵と本人確認の結果を受け取る」場面で受け取ったアクセストークンを、ここで使います。</p>
          <div v-if="stage.id === 'cookie'" class="cookie-example" aria-label="表示設定を覚えるCookieの例"><span>例：表示設定を覚える</span><code>display=dark</code><span>「暗い画面が好み」と覚えてもらう</span></div>
          <div v-if="stage.terms.length" class="slide-term-list"><span>言葉を確認：</span><InlineTerm v-for="id in stage.terms" :key="`${stage.id}-${id}`" :id="id" /></div>
        </div>
        <nav class="slide-pagination" aria-label="前後の場面">
          <a v-if="previous" class="plain-button" :href="`#journey/${previous.id}`">← 前へ</a><button v-else type="button" class="plain-button" disabled>← 前へ</button>
          <button type="button" class="overview-toggle" :aria-expanded="showOverview" aria-controls="journey-overview" @click="showOverview = !showOverview">{{ stageIndex + 1 }} / {{ journey.length }} · 場面を選ぶ</button>
          <a v-if="next" class="primary-button" :href="`#journey/${next.id}`">次へ →</a><button v-else class="primary-button" type="button" @click="replay">通信を見ながら、もう一周 ↻</button>
        </nav>
        <nav v-if="showOverview" id="journey-overview" class="slide-overview" aria-label="場面の一覧"><ol><li v-for="(item, index) in journey" :key="item.id"><a :href="`#journey/${item.id}`" :aria-current="index === stageIndex ? 'step' : undefined" @click="revisit($event, item.id)"><span>{{ index + 1 }}</span>{{ item.title }}</a></li></ol></nav>
      </section>
      <aside v-if="communication" id="journey-communication" class="journey-communication" aria-labelledby="communication-heading">
        <div class="communication-heading"><h2 id="communication-heading">この場面のやり取り</h2><span>{{ stage.panels ? '規格の解説' : stage.traceIds.length === 0 ? '仕組みの例' : recording ? '事前記録' : '選択中の実演' }}</span></div>
        <template v-if="stage.panels">
          <p>OIDCの共通の約束を整理する場面です。通信記録とは区別して表示しています。</p>
          <p v-if="stage.id === 'review'">「認証を依頼する」「認証結果を受け取る」「認証結果を検証する」のリンクから各場面へ戻り、記録と対応づけて確認できます。</p>
          <p v-else>このあと「本人確認をお願いする」「鍵と本人確認の結果を受け取る」「結果を確かめて、ログインする」の場面で、実際のやり取りを確認します。</p>
        </template>
        <template v-else-if="stage.id === 'cookie'">
          <p>サイトがCookieを渡し、ブラウザが送り返す例です。</p>
          <section class="cookie-wire-example"><h3>サイト → ブラウザ</h3><p>この値を覚えておいてください。</p><dl class="fields"><div><dt><InlineTerm id="cookie" label="Set-Cookie" /></dt><dd><code>display=dark</code></dd></div></dl></section>
          <section class="cookie-wire-example"><h3>ブラウザ → サイト</h3><p>次のアクセスで、覚えていた値を送ります。</p><dl class="fields"><div><dt><InlineTerm id="cookie" label="Cookie" /></dt><dd><code>display=dark</code></dd></div></dl></section>
          <p class="support-text">仕組みを示すための例です。このアプリの通信記録ではありません。</p>
        </template>
        <template v-else-if="trace">
          <label v-if="traces.length > 1" class="trace-select">表示するやり取り<select :value="trace.id" @change="selectedTrace = ($event.target as HTMLSelectElement).value"><option v-for="item in traces" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
          <TraceDetails :key="trace.id" :step="trace" :recording="recording" />
          <a class="all-records-link" :href="`#flow/${trace.id}`">通信記録の全体で見る →</a>
        </template>
        <p v-else-if="stage.traceIds.length === 0">APIを守る理由と、トークンを受け取る目的を示す説明です。実際の通信記録は、このあとの手順で確認できます。</p>
        <p v-else-if="stage.id === 'start'">この記録には、最初にデータの取得を求めたときの通信が含まれていません。</p>
        <p v-else>この場面に対応する記録はありません。</p>
      </aside>
    </div>
    <nav class="journey-resources" aria-label="学習の補助資料"><a href="#flow">通信記録をまとめて調べる</a><a href="#learn/glossary">用語辞典</a><a href="#learn/basics">参考解説</a></nav>
  </div>
</template>
