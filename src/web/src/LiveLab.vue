<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import SequenceDiagram from './SequenceDiagram.vue'
import { actors, articles } from './replay'
import { liveIndex, liveSteps, nextAction, phaseLabel } from './live'
import type { Actor } from './replay'
import type { LabAttempt, LabStatus } from './live'

const attempt = ref<LabAttempt | null>(null)
const available = ref(false)
const loading = ref(true)
const message = ref('')
const pkce = ref('correct')
const index = ref(liveIndex(window.location.hash))
const steps = computed(() => liveSteps(attempt.value))
const step = computed(() => steps.value[index.value]!)
const action = computed(() => nextAction(attempt.value?.phase))
const actorHosts = computed(() => ({ browser: '利用者の端末', client: 'このアプリ', provider: 'Keycloak', resource: 'Resource API', ...attempt.value?.hosts }))
const header = ref<HTMLElement>()
let observer: ResizeObserver | undefined
const number = (n: number) => String(n + 1).padStart(2, '0')
const actor = (id: Actor) => actors.find(item => item.id === id)!.name
const kinds = { request: 'HTTP リクエスト', response: 'HTTP レスポンス', internal: '内部処理' }
const preview = computed(() => pkce.value === 'wrong' && action.value?.id === 'token'
  ? attempt.value?.nextRequest?.replace(/code_verifier=\[[^\]]+\]/, 'code_verifier=[別のverifierを実行時に生成]') : attempt.value?.nextRequest)

async function syncRoute() {
  index.value = liveIndex(window.location.hash)
  await nextTick()
  const heading = document.getElementById('step-heading')
  heading?.focus({ preventScroll: true })
  heading?.scrollIntoView({ block: 'start' })
}
function go(value: number) {
  const target = steps.value[value]
  if (!target) return
  index.value = value
  const hash = `#/lab/${target.id}`
  if (window.location.hash === hash) void syncRoute()
  else window.location.hash = hash
}
function focusNavigation() {
  const heading = document.getElementById('navigation-heading')
  heading?.focus({ preventScroll: true })
  heading?.scrollIntoView({ block: 'start' })
}
function focusMain() { document.getElementById('main-content')?.focus() }
async function readStatus() {
  loading.value = true
  try {
    const response = await fetch('/api/lab', { cache: 'no-store' })
    if (!response.ok) throw new Error()
    const status: LabStatus = await response.json()
    if (typeof status.available !== 'boolean') throw new Error()
    available.value = status.available
    attempt.value = status.attempt
    message.value = status.available ? '' : 'この環境では実演が有効になっていません。ローカル実演環境で開いてください。'
  } catch {
    available.value = false
    message.value = '実演サーバーに接続できません。ローカル実演環境を起動し、https://localhost:7443/ で開いてください。'
  } finally { loading.value = false }
}
async function execute(reset = false) {
  if (loading.value || !available.value) return
  loading.value = true
  message.value = ''
  try {
    const target = reset || !attempt.value ? 'prepare' : action.value?.id
    if (!target || target === 'authorize') return
    const path = target === 'prepare' ? '/api/lab' : `/api/lab/${encodeURIComponent(attempt.value!.id)}/${target === 'api' ? 'resource' : target}`
    const response = await fetch(path, {
      method: 'POST', headers: { 'X-Oidc-Lens': 'workshop', 'Content-Type': 'application/json' },
      body: target === 'token' ? JSON.stringify({ pkce: pkce.value }) : '{}',
    })
    const data = await response.json()
    if (!data || typeof data.id !== 'string' || !Array.isArray(data.logs)) throw new Error()
    attempt.value = data as LabAttempt
    if (reset) pkce.value = 'correct'
    go(steps.value.findIndex(item => item.id === target))
  } catch {
    message.value = '操作を完了できませんでした。状態を再取得して確認してください。期限切れの場合は新しい試行を準備してください。'
  } finally { loading.value = false }
}
const hashChanged = () => void syncRoute()
const restored = (event: PageTransitionEvent) => { if (event.persisted) void readStatus() }
onMounted(async () => {
  window.addEventListener('hashchange', hashChanged)
  window.addEventListener('pageshow', restored)
  if (header.value) {
    observer = new ResizeObserver(() => document.documentElement.style.setProperty('--header-height', `${header.value!.getBoundingClientRect().height}px`))
    observer.observe(header.value)
  }
  await readStatus()
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', hashChanged)
  window.removeEventListener('pageshow', restored)
  observer?.disconnect()
  document.documentElement.style.removeProperty('--header-height')
})
</script>

<template>
  <a class="skip-link" href="#main-content" @click.prevent="focusMain">本文へ移動</a>
  <header ref="header" class="masthead">
    <div class="masthead-inner"><a class="brand" href="#/lab/prepare">OIDC Lens</a><span class="header-subtitle">Keycloakで実際に試す</span><a class="navigation-link" href="#step-navigation" @click.prevent="focusNavigation">場面一覧</a><span class="simulation-label live-label">実通信の記録</span></div>
    <div class="current-context" aria-label="表示中の場面"><span class="current-number">{{ number(index) }} / {{ steps.length }}</span><strong>{{ step.title }}</strong></div>
  </header>
  <main id="main-content" tabindex="-1">
    <section class="intro" aria-labelledby="page-heading">
      <h1 id="page-heading">操作して、応答を確かめる</h1>
      <p>実行するたびに、KeycloakやAPIとの通信が記録されます。コード受領・交換・検証・ログイン・API利用の間で待機します。</p>
      <div class="lab-links"><a href="#/oidc/token">疑似ログの教材へ戻る</a><button class="text-button" type="button" :disabled="loading" @click="readStatus">状態を再取得</button></div>
      <details class="premise"><summary>実験の前提と、ログの見方</summary><div class="premise-body">
        <p>Keycloakの本人確認・許可の画面では、ご自身で操作してください。ローカルデモのユーザーは <code>workshop</code>、パスワードは <code>oidc-lens-demo</code> です。</p>
        <p>実験用のpublic clientとPKCE（S256）を使います。コード・verifier・トークン・Cookieなどの機密値は、同じ値を追えるラベルに置換し、HTTPの主要項目を抜粋・整形して表示します。実際のトークンはサーバーに保持します。</p>
        <p>Keycloak内の本人確認処理とResource API内部の検査は、この画面からは未観測です。内部処理として表示するのは、このクライアントが実行した処理です。公開鍵取得とIDトークン検証、セッションの作成を分けるのは教材のための構成です。</p>
        <p>認可コードは短命で一回限りです。失敗した要求を同じコードで再送せず、「新しい試行を準備」から比較し直します。新しい試行では前のアプリのログインを終了します。試行の記録はサーバーに15分保持します。</p>
      </div></details>
    </section>

    <div class="workspace">
      <nav id="step-navigation" class="timeline" aria-label="実験ログの場面"><h2 id="navigation-heading" tabindex="-1">実験の流れ <span>{{ steps.length }}場面</span></h2>
        <label class="mobile-step-select">場面を選ぶ<select :value="index" @change="go(Number(($event.target as HTMLSelectElement).value))"><option v-for="(item, n) in steps" :key="item.id" :value="n">{{ number(n) }} {{ item.title }}</option></select></label>
        <ol class="step-list"><li v-for="(item, n) in steps" :key="item.id"><button type="button" :aria-current="n === index ? 'step' : undefined" @click="go(n)"><span class="step-number">{{ number(n) }}</span><span><small>{{ item.logs.length ? '記録あり' : '未記録' }} · {{ item.phase }}</small>{{ item.title }}<em v-if="n === index">表示中</em></span></button></li></ol>
      </nav>
      <section class="trace" aria-labelledby="step-heading">
        <div class="step-meta"><span>場面 {{ number(index) }} / {{ steps.length }}</span><span>実通信・実処理の記録</span></div>
        <h2 id="step-heading" tabindex="-1">{{ step.title }}</h2><p class="step-summary">{{ step.summary }}</p>
        <section class="lab-control" aria-labelledby="lab-control-heading" :aria-busy="loading">
          <div class="lab-control-heading"><h3 id="lab-control-heading">{{ phaseLabel(attempt?.phase) }}</h3><span v-if="loading" role="status">通信中…</span></div>
          <p v-if="message" class="lab-error" role="status">{{ message }}</p>
          <p v-if="attempt?.error" class="lab-error" role="status">{{ attempt.error }}</p>
          <template v-if="!attempt"><p>まず設定とPKCEを準備します。このボタンを押すまで認可サーバーへの要求は送りません。</p><button class="primary-button" type="button" :disabled="loading || !available" @click="execute(true)">実験を準備する</button></template>
          <template v-else-if="action">
            <p>{{ action.help }}</p>
            <label v-if="action.id === 'token'" class="pkce-choice">コード交換の条件<select v-model="pkce" :disabled="loading"><option value="correct">保存した正しいverifierを送る</option><option value="wrong">別のverifierを送る（失敗を試す）</option></select></label>
            <p v-if="action.id === 'token'" class="lab-explanation">認可コードだけを入手しても、対応するverifierがなければ交換できるでしょうか。条件を変え、Keycloakの応答で確かめます。</p>
            <details v-if="preview" class="request-preview"><summary>次に実行する内容を見る（まだ未実行）</summary><pre><code>{{ preview }}</code></pre></details>
            <a v-if="action.id === 'authorize'" class="primary-button action-link" :href="`/auth/lab/start?id=${attempt.id}`">{{ action.label }} →</a>
            <button v-else class="primary-button" type="button" :disabled="loading" @click="execute()">{{ action.label }} →</button>
          </template>
          <template v-else-if="attempt.phase === 'authorizing'"><p>Keycloakで本人確認と許可を完了すると、この画面に戻ります。途中で戻った場合は、新しい試行からやり直せます。</p></template>
          <template v-else-if="attempt.phase === 'complete'"><p class="lab-success">実際の保護APIから200を受領しました。</p><pre><code>{{ attempt.resourceMessage }}</code></pre></template>
          <button v-if="attempt" class="text-button restart-lab" type="button" :disabled="loading || !available" @click="execute(true)">新しい試行を準備</button>
          <details v-if="attempt?.previousTokenResponse" class="previous-response"><summary>前の試行のトークン応答と比べる</summary><p>別の認可コードを使った試行です。同じコードの再送ではありません。</p><pre><code>{{ attempt.previousTokenResponse }}</code></pre></details>
        </section>

        <SequenceDiagram :steps="steps" :selected-index="index" :actor-hosts="actorHosts" />
        <div class="log-heading"><h3>通信・処理ログ</h3><span>実測 / 機密値をラベルに置換・主要項目を抜粋</span></div>
        <p v-if="!step.logs.length" class="empty-log">この場面はまだ記録されていません。場面の表示を切り替えるだけでは通信は実行しません。</p>
        <ol class="logs"><li v-for="(log, n) in step.logs" :key="`${step.id}-${n}`" :class="['log-entry', log.kind]">
          <div class="log-meta"><span class="log-id">{{ number(index) }}.{{ n + 1 }}</span><strong>{{ actor(log.from) }} {{ log.kind === 'internal' ? '↻' : '→ ' + actor(log.to) }}</strong><span class="kind">{{ kinds[log.kind] }}</span><time v-if="log.recordedAt" :datetime="log.recordedAt">{{ new Date(log.recordedAt).toLocaleTimeString('ja-JP') }}</time></div>
          <p class="log-label">{{ log.label }}</p><pre :aria-label="`${kinds[log.kind]}の内容`"><code>{{ log.wire }}</code></pre>
        </li></ol>
        <div class="article-connection"><span>記事とのつながり</span><p><a :href="articles.oidc.url + '#説明手順'" target="_blank" rel="noreferrer">OIDC記事 {{ step.article.range }}（別タブ）</a> ― {{ step.article.connection }}</p></div>
        <p v-if="step.id === 'token'" class="highlight">PKCEでは、認可要求時のchallengeとコード交換時のverifierの対応をKeycloakが検査します。client_secretを使用しないこの実験で、その効果を確かめます。</p>
        <nav class="step-controls" aria-label="ログ表示の前後移動"><button class="secondary-button" type="button" :disabled="index === 0" @click="go(index - 1)">← 表示を戻す</button><span>{{ number(index) }} / {{ steps.length }}</span><button class="secondary-button" type="button" :disabled="index === steps.length - 1" @click="go(index + 1)">表示を進める →</button></nav>
      </section>
    </div>
  </main>
  <footer><p>OIDC Lens · Keycloakで実際に試す</p><p>未実行の処理はログにも図の矢印にも表示しません。</p></footer>
</template>
