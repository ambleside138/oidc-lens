<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { actors, articles, makeReplay, parseReplayHash, questions } from './replay'
import SequenceDiagram from './SequenceDiagram.vue'
import type { Actor } from './replay'

const initial = parseReplayHash(window.location.hash)
const index = ref(initial.index)
const steps = makeReplay()
const step = computed(() => steps[index.value]!)
const article = computed(() => articles[step.value.article.protocol])
const label = (actor: Actor) => actors.find(item => item.id === actor)!.name
const isLast = computed(() => index.value === steps.length - 1)
const number = (value: number) => String(value + 1).padStart(2, '0')
const kindLabels = { request: 'HTTP リクエスト', response: 'HTTP レスポンス', internal: '内部処理' }
const header = ref<HTMLElement>()
let headerObserver: ResizeObserver | undefined

async function syncRoute(focus = true) {
  const route = parseReplayHash(window.location.hash)
  index.value = route.index
  await nextTick()
  if (focus) {
    const heading = document.getElementById('step-heading')
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }
}
function go(nextIndex: number) {
  const target = steps[nextIndex]
  if (!target) return
  const hash = `#/oidc/${target.id}`
  index.value = nextIndex
  if (hash === window.location.hash) void syncRoute()
  else window.location.hash = hash
}
function focusMain() { document.getElementById('main-content')?.focus() }
function focusNavigation() {
  const target = document.getElementById('navigation-heading')
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'start' })
}
const hashChanged = () => void syncRoute()
onMounted(() => {
  window.addEventListener('hashchange', hashChanged)
  if (header.value) {
    headerObserver = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--header-height', `${header.value!.getBoundingClientRect().height}px`)
    })
    headerObserver.observe(header.value)
  }
  if (window.location.hash.startsWith('#/oauth/')) window.history.replaceState(null, '', `#/oidc/${step.value.id}`)
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', hashChanged)
  headerObserver?.disconnect()
  document.documentElement.style.removeProperty('--header-height')
})
</script>

<template>
  <a class="skip-link" href="#main-content" @click.prevent="focusMain">本文へ移動</a>
  <header ref="header" class="masthead">
    <div class="masthead-inner"><a class="brand" href="#/oidc/blocked">OIDC Lens</a><span class="header-subtitle">OpenID Connect 通信ログ</span><a class="navigation-link" href="#step-navigation" @click.prevent="focusNavigation">場面一覧</a><span class="simulation-label">教材用の疑似ログ</span></div>
    <div class="current-context" aria-label="表示中の場面"><span class="current-number">{{ number(index) }} / {{ steps.length }}</span><strong>{{ step.title }}</strong></div>
  </header>
  <main id="main-content" tabindex="-1">
    <section class="intro" aria-labelledby="page-heading">
      <p class="eyebrow">記事を読んだ、その次に</p><h1 id="page-heading">記事の図を、通信ログで追い直す</h1>
      <p>写真APIの拒否から、権限の取得、データの表示まで。誰が・誰に・何を渡したかを、12の場面で確かめます。</p>
      <a class="lab-entry" href="#/lab/prepare">Keycloakで実際に試す →</a>
      <details class="premise"><summary>このログの前提と、2つの参考記事</summary><div class="premise-body">
        <p><a :href="articles.oauth.url" target="_blank" rel="noreferrer">{{ articles.oauth.title }}（別タブ）</a>と、<a :href="articles.oidc.url" target="_blank" rel="noreferrer">{{ articles.oidc.title }}（別タブ）</a>を読んだ方向けの補助教材です。各場面で記事の説明手順の番号と対応付けています。記事自体がAuthorization Code FlowのHTTPを説明しているわけではありません。</p>
        <p>これは<strong>架空のサーバー側Webアプリの疑似ログ</strong>です。外部への認証やAPI通信、暗号計算は実行しません。既存のKeycloak実演の記録を再現したものではありません。コード・トークン・鍵の値は教材識別子または省略表記です。時刻は固定の教材内時刻です。</p>
        <p>Authorization Code Flow + PKCE、クライアント認証、明示的な許可、Cookieセッション、不透明なアクセストークンとintrospectionを使う一例です。本人確認画面・Cookie・APIの権限名はこの例の選択です。OPはOpenIDプロバイダーを指します。</p>
        <p class="spec-links">通信の補足仕様：<a href="https://www.rfc-editor.org/rfc/rfc6749.html#section-4.1" target="_blank" rel="noreferrer">OAuth 2.0 §4.1</a> / <a href="https://openid.net/specs/openid-connect-core-1_0.html#CodeFlowAuth" target="_blank" rel="noreferrer">OIDC Core §3.1</a> / <a href="https://www.rfc-editor.org/rfc/rfc7636.html" target="_blank" rel="noreferrer">PKCE</a> / <a href="https://www.rfc-editor.org/rfc/rfc7662.html" target="_blank" rel="noreferrer">introspection</a>（いずれも別タブ）</p>
      </div></details>
    </section>
    <div class="workspace">
      <nav id="step-navigation" class="timeline" aria-label="時系列ログの場面"><h2 id="navigation-heading" tabindex="-1">通信の流れ <span>12場面</span></h2>
        <label class="mobile-step-select">場面を選ぶ<select :value="index" @change="go(Number(($event.target as HTMLSelectElement).value))"><option v-for="(item, itemIndex) in steps" :key="item.id" :value="itemIndex">{{ number(itemIndex) }} {{ item.title }}</option></select></label>
        <ol class="step-list"><li v-for="(item, itemIndex) in steps" :key="item.id"><button type="button" :aria-current="itemIndex === index ? 'step' : undefined" @click="go(itemIndex)"><span class="step-number">{{ number(itemIndex) }}</span><span><small>{{ item.phase }}</small>{{ item.title }}<em v-if="itemIndex === index">表示中</em></span></button></li></ol>
      </nav>
      <section class="trace" aria-labelledby="step-heading">
        <div class="step-meta"><span>場面 {{ number(index) }} / 12</span><span>{{ step.route }}</span></div>
        <h2 id="step-heading" tabindex="-1">{{ step.title }}</h2><p class="step-summary">{{ step.summary }}</p>
        <SequenceDiagram :steps="steps" :selected-index="index" />
        <div class="log-heading"><h3>通信・処理ログ</h3><span>すべて疑似ログ / 主要項目を抜粋</span></div>
        <ol class="logs"><li v-for="(log, logIndex) in step.logs" :key="`${step.id}-${logIndex}`" class="log-entry" :class="log.kind">
          <div class="log-meta"><span class="log-id">{{ number(index) }}.{{ logIndex + 1 }}</span><strong>{{ label(log.from) }}<span v-if="log.kind !== 'internal'" class="sr-only">から</span><span aria-hidden="true"> {{ log.kind === 'internal' ? '↻' : '→' }} </span><span v-if="log.kind !== 'internal'">{{ label(log.to) }}<span class="sr-only">へ</span></span></strong><span class="kind">{{ kindLabels[log.kind] }}</span></div>
          <p class="log-label">{{ log.label }}</p><pre :aria-label="`${kindLabels[log.kind]}の内容`"><code>{{ log.wire }}</code></pre>
        </li></ol>
        <div class="article-connection"><span>記事とのつながり</span><p><a :href="article.url + '#説明手順'" target="_blank" rel="noreferrer">{{ step.article.protocol === 'oidc' ? 'OIDC記事' : 'OAuth記事' }} {{ step.article.range }}（別タブ）</a> ― {{ step.article.connection }}</p></div>
        <p v-if="step.highlight" class="highlight">{{ step.highlight }}</p>
        <section class="reading" aria-labelledby="reading-heading"><h3 id="reading-heading">このログの読みどころ</h3><dl><template v-for="item in step.inspect" :key="item.field"><dt>{{ item.field }}</dt><dd>{{ item.meaning }}</dd></template></dl></section>
        <p class="result"><strong>ここまでで分かったこと</strong>{{ step.result }}</p>
        <section v-if="isLast" class="review" aria-labelledby="review-heading"><p class="eyebrow">ログを閉じる前に</p><h3 id="review-heading">流れを自分の言葉で説明できますか？</h3><p>まず答えを考えてから、ログの根拠と照らし合わせてください。</p>
          <details v-for="question in questions" :key="question.step"><summary>{{ question.question }}</summary><div><p>{{ question.answer }}</p><button type="button" class="text-button" @click="go(steps.findIndex(item => item.id === question.step))">{{ question.link }} →</button></div></details>
        </section>
        <nav class="step-controls" aria-label="ログの前後移動"><button class="secondary-button" type="button" :disabled="index === 0" @click="go(index - 1)">← 前へ</button><span aria-live="polite" aria-atomic="true">{{ number(index) }} / 12</span><button class="primary-button" type="button" @click="isLast ? go(0) : go(index + 1)">{{ isLast ? '最初へ ↺' : '次へ →' }}</button></nav>
      </section>
    </div>
  </main>
  <footer><p>OIDC Lens · 通信を追うための補助教材</p><p>教材識別子は実際の資格情報ではありません。ログ内の処理は実行していません。</p></footer>
</template>
