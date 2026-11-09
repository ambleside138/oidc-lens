<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { chapters, glossary, misconceptions, questions, references, walkthrough } from './learning'
import type { LearningRoute, ReferenceId } from './learning'

const props = defineProps<{ route: LearningRoute; availableSteps: string[]; backHref: string; backLabel: string }>()
const emit = defineEmits<{ observe: [stepId: string] }>()
const chapterIndex = computed(() => chapters.findIndex(chapter => chapter.id === props.route.chapter))
const chapter = computed(() => chapters[chapterIndex.value]!)
const search = ref('')
const group = ref('すべて')
const answers = ref<Record<number, number>>({})
const filteredTerms = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return glossary.filter(term => (group.value === 'すべて' || term.group === group.value) &&
    (!query || `${term.label} ${term.meaning} ${term.why} ${term.here}`.toLocaleLowerCase().includes(query)))
})
const answeredCount = computed(() => Object.keys(answers.value).length)
const correctCount = computed(() => questions.filter((question, index) => answers.value[index] === question.answer).length)
const chapterSources = computed<ReferenceId[]>(() => {
  switch (props.route.chapter) {
    case 'basics': return ['core', 'oauth']
    case 'oauth': return ['oauth', 'core', 'pitfalls']
    case 'tokens': return ['core', 'oauth', 'bearer', 'jwt']
    case 'walkthrough': return ['core', 'pkce', 'security', 'form', 'bff']
    case 'glossary': return ['core', 'oauth', 'discovery', 'pkce']
    default: return Object.keys(references) as ReferenceId[]
  }
})

watch(() => [props.route.chapter, props.route.term], async () => {
  if (props.route.term) {
    search.value = ''
    group.value = 'すべて'
  }
  await nextTick()
  const target = document.getElementById(props.route.term ? `term-${props.route.term}` : 'learning-heading')
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'start' })
}, { immediate: true })
</script>

<template>
  <div class="learning-layout">
    <nav class="panel curriculum" aria-label="学習ガイドの章">
      <div class="panel-heading"><h2>用語辞典・参考解説</h2></div>
      <ol>
        <li v-for="(item, index) in chapters" :key="item.id">
          <a :href="`#learn/${item.id}`" :aria-current="route.chapter === item.id ? 'page' : undefined">
            <span class="chapter-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span>{{ item.title }}<small>{{ item.summary }}</small></span>
          </a>
        </li>
      </ol>
      <p class="curriculum-note">学習画面で出会った言葉や仕組みを、ここで詳しく確認できます。</p>
      <a class="back-to-flow" :href="backHref">← {{ backLabel }}</a>
    </nav>

    <article class="panel lesson" aria-labelledby="learning-heading">
      <header class="lesson-header">
        <p class="eyebrow">CHAPTER {{ String(chapterIndex + 1).padStart(2, '0') }} / 06</p>
        <h1 id="learning-heading" tabindex="-1">{{ chapter.title }}</h1>
        <p>{{ chapter.summary }}</p>
      </header>

      <div class="lesson-body">
        <p class="reference-return"><a :href="backHref">← {{ backLabel }}</a> · <a href="#journey">全体像から学ぶ</a></p>
        <template v-if="route.chapter === 'basics'">
          <p class="lesson-lead">OIDC（OpenID Connect）は、信頼する認証サービスの認証結果を、アプリが共通の方法で受け取り、検証するための仕組みです。</p>
          <p>例えば「別のサービスのアカウントでログインする」とき、アプリはそのサービスにユーザーの認証を任せます。アプリ自身へ、そのサービスのパスワードを渡す必要はありません。</p>
          <div class="concept-grid">
            <section class="concept-card"><span class="concept-label">認証 — 誰として利用する？</span><h2>「誰か」を確認する</h2><p>例：この利用者は、Keycloakで識別されるユーザーAである。</p><a href="#learn/glossary/authentication">認証の用語解説 →</a></section>
            <section class="concept-card"><span class="concept-label">認可 — 何を許す？</span><h2>アクセスや操作を許す</h2><p>例：このアプリに写真の読み取りを許す。このユーザーに文書の編集を許す。</p><a href="#learn/glossary/authorization">認可の用語解説 →</a></section>
          </div>
          <h2>まず、登場人物を押さえる</h2>
          <div class="actor-cards">
            <section><h3>Browser</h3><p>ユーザーが操作するブラウザ。画面を表示し、アプリと認証サービスの間を移動します。</p></section>
            <section><h3>App / Client / RP</h3><p>ログインしたいアプリ。このデモではBFFが認証結果を受け取り、検証します。</p></section>
            <section><h3>IdP / OP</h3><p>認証を提供するサービス。このデモのKeycloakです。ユーザーを認証し、トークンを発行します。</p></section>
            <section><h3>Resource API</h3><p>保護された機能を提供するAPI。アクセストークンを受け付け、アクセスを判断します。</p></section>
          </div>
          <h2>OIDCで決まること・別に設計すること</h2>
          <div class="table-scroll"><table class="lesson-table"><caption>OIDCの担当範囲</caption><thead><tr><th scope="col">OIDCが定めるもの</th><th scope="col">OIDCだけでは決まらないもの</th></tr></thead><tbody>
            <tr><td>認証結果を要求し、受け取る方法</td><td>パスワード・パスキー・多要素認証など、実際の認証方法</td></tr>
            <tr><td>IDトークンとその検証方法、ユーザー情報の表し方</td><td>アプリの管理者権限、データ単位の閲覧・編集権限</td></tr>
            <tr><td>異なる提供元と共通の手順で連携する土台</td><td>アプリのセッション管理、全サービスのログアウト連携</td></tr>
          </tbody></table></div>
          <p>OIDCは特定の製品名でも、JWTの別名でもありません。また、オンラインのアカウントの認証と、身分証などによる現実世界の本人確認は別です。</p>
          <aside class="app-note"><strong>このアプリでは</strong><p>Keycloakが認証し、ASP.NET CoreのBFFが結果を検証します。学習の中心はAuthorization Code Flow + PKCE S256です。KeycloakはOIDCを実装する製品の一つです。</p></aside>
          <details class="deep-dive"><summary>もう少し詳しく：信頼しているのは何？</summary><p>アプリは、あらかじめ設定した提供元がユーザーを認証したという結果を、署名や発行者、宛先などの検証を通じて受け入れます。どの程度強い認証なのか、アカウント登録時にどのような本人確認をしたかは、提供元の運用や要求する認証条件にもよります。</p></details>
        </template>

        <template v-else-if="route.chapter === 'oauth'">
          <p class="lesson-lead">OAuth 2.0はAPIなどへのアクセスを認可する枠組み。OIDCはその上に、ユーザー認証の結果を伝える共通の仕組みを加えます。</p>
          <div class="protocol-stack" role="img" aria-label="OAuth 2.0を土台に、OIDCがユーザー認証の仕組みを追加する">
            <div class="stack-oidc"><strong>OIDCで追加</strong><span>ユーザー認証の結果・IDトークン・検証ルール</span></div>
            <div class="stack-oauth"><strong>OAuth 2.0が土台</strong><span>認可リクエスト・コード交換・アクセストークン</span></div>
          </div>
          <div class="table-scroll"><table class="lesson-table"><caption>OAuth 2.0とOIDCの関係</caption><thead><tr><th scope="col">観点</th><th scope="col">OAuth 2.0</th><th scope="col">OIDC</th></tr></thead><tbody>
            <tr><th scope="row">中心となる問い</th><td>このアプリに、どのリソースへのアクセスを許す？</td><td>このアプリを利用するユーザーは誰？</td></tr>
            <tr><th scope="row">代表的な結果</th><td>APIへのアクセスに使うアクセストークン</td><td>認証結果を伝えるIDトークン。フローによってアクセストークンも受け取る</td></tr>
            <tr><th scope="row">ユーザー認証の伝え方</th><td>Clientへの共通の伝達方法を、それ自体では定めない</td><td>ClaimやIDトークンの検証方法などを標準化</td></tr>
            <tr><th scope="row">このデモの要求</th><td>response_type=codeでコードを要求</td><td>さらにscopeにopenidを含め、OIDCの認証を要求</td></tr>
          </tbody></table></div>
          <h2>同じログイン操作の中で、両方が動く</h2>
          <p>このデモでは一度のコード交換で、IDトークンとアクセストークンを取得します。BFFがIDトークンで認証結果を確認し、アクセストークンでAPIを呼びます。「どちらか片方を選ぶ」という関係ではありません。</p>
          <aside class="lesson-callout"><strong>「OAuthには認証が一切ない」という意味ではありません</strong><p>ユーザーが認可サーバーへログインしたり、Clientがトークンエンドポイントで自分を認証したりする処理はあります。それと、Clientへユーザーの認証結果を安全に伝える仕様があるかは別の話です。</p></aside>
          <h2>openidは何の合図？</h2>
          <p><code>scope=openid</code>は、OIDCとしてユーザー認証を要求する合図です。<code>profile</code>や<code>email</code>は追加のユーザー情報を求めるために使われます。スコープは、アプリ内の「管理者」「一般ユーザー」と同じものではありません。</p>
          <aside class="app-note"><strong>このアプリでは</strong><p>BFFはopenidを要求します。保護APIのデモはトークンの検証を扱い、スコープやロールごとに業務機能を制限する例までは実装していません。</p></aside>
          <details class="deep-dive"><summary>もう少し詳しく：OAuthは必ずユーザーを伴う？</summary><p>いいえ。Client Credentialsのように、ユーザーを伴わずアプリ自身がアクセスするフローもあります。アクセストークンがあるという事実だけで、「目の前のユーザーが今回ログインした」とは判断できません。</p></details>
        </template>

        <template v-else-if="route.chapter === 'tokens'">
          <p class="lesson-lead">まず「誰に向けて、何のために発行されたか」を見ます。どちらもトークンですが、相互に代用するものではありません。</p>
          <div class="token-paths" aria-label="トークンごとの宛先">
            <div><span>IDトークン</span><strong>Keycloak → BFF</strong><small>このアプリ向けの認証結果を確認</small></div>
            <div><span>アクセストークン</span><strong>Keycloak → BFF → Resource API</strong><small>対象APIへアクセスするために使用</small></div>
          </div>
          <div class="table-scroll"><table class="lesson-table"><caption>IDトークンとアクセストークンの比較</caption><thead><tr><th scope="col">観点</th><th scope="col">IDトークン</th><th scope="col">アクセストークン</th></tr></thead><tbody>
            <tr><th scope="row">目的</th><td>ユーザー認証の結果をClientに伝える</td><td>対象リソースにアクセスする</td></tr>
            <tr><th scope="row">主な宛先</th><td>Client / RP（このデモではBFF）</td><td>Resource Server（このデモではResource API）</td></tr>
            <tr><th scope="row">主に検証する側</th><td>Client / RP</td><td>受け取るAPIなどのResource Server</td></tr>
            <tr><th scope="row">形式</th><td>JWT</td><td>JWTの場合も、不透明な文字列の場合もある</td></tr>
            <tr><th scope="row">代表的な確認</th><td>署名、iss、aud、exp、送ったnonceとの一致など</td><td>形式に応じた有効性の検証と、対象API・操作に必要な権限の確認</td></tr>
            <tr><th scope="row">このアプリの利用</th><td>BFFが検証し、ログインのセッションを確立</td><td>BFFが保持し、API呼び出し時にBearerとして送信</td></tr>
          </tbody></table></div>
          <h2>コード・Cookie・更新トークンも別物</h2>
          <ul class="reading-list">
            <li><a href="#learn/glossary/code">認可コード</a>：トークンと交換するための短寿命・一度限りのコード。APIへは送りません。</li>
            <li><a href="#learn/glossary/cookie">セッションCookie</a>：このアプリでは、ブラウザがBFFのセッションを識別するために使います。トークンをCookie内に格納しているわけではありません。</li>
            <li><a href="#learn/glossary/refresh_token">更新トークン</a>：新しいアクセストークンを要求するための資格情報。このアプリでは自動更新に使用しません。</li>
          </ul>
          <h2>デコードと検証を分けて考える</h2>
          <p>JWTの中身が読めても、本物とは限りません。署名の検証に加え、「信頼する発行者か」「自分向けか」「期限内か」「今回の要求に対応するか」などを確認します。署名は内容を隠す暗号化とは違います。</p>
          <div class="claim-example"><span>架空のIDトークンのPayload（説明用の抜粋）</span><pre><code>{
  "iss": "https://identity.example",
  "sub": "user-123",
  "aud": "example-app",
  "exp": 2000000000,
  "nonce": "request-specific-value"
}</code></pre><p>発行者はiss、ユーザーはsub、宛先はaud、期限はexp。nonceで要求との対応を確認します。このJSONは有効なトークンや検証成功例ではありません。</p></div>
          <aside class="app-note"><strong>このアプリのInspectorについて</strong><p>秘密値や個人に結び付く値はマスクしています。「あり」は値の存在を示し、個々の検証の合否ではありません。認証処理の結果は後続検証とセッション確立まで確認して表示します。事前記録のexpや成功表示は採取時の情報です。</p></aside>
          <details class="deep-dive"><summary>もう少し詳しく：UserInfoはどのトークンで呼ぶ？</summary><p>OIDCにはユーザー情報を取得するUserInfoエンドポイントもあります。ここへ送るのもアクセストークンです。情報の内容がユーザープロフィールであることと、アクセスに使うトークンの用途は区別します。このデモはUserInfoを呼び出しません。</p></details>
        </template>

        <template v-else-if="route.chapter === 'walkthrough'">
          <p class="lesson-lead">誰が、誰に、何を渡すかを順に追いましょう。ここでは、このアプリが採用するBFF構成を説明します。</p>
          <aside class="app-note"><strong>このアプリの構成</strong><p>Vueの画面とBFFを同一オリジンで配信しています。ブラウザはCookieでBFFにアクセスし、トークンの取得・保持とResource APIの呼び出しはBFFが担当します。</p></aside>
          <ol class="walkthrough-list">
            <li v-for="(item, index) in walkthrough" :key="item.step">
              <span class="walkthrough-number">{{ index + 1 }}</span>
              <div><p class="route-label">{{ item.route }}</p><h2>{{ item.title }}</h2><p>{{ item.text }}</p><p class="observation-prompt">{{ item.check }}</p>
                <button v-if="availableSteps.includes(item.step)" class="plain-button" type="button" @click="emit('observe', item.step)">フローでこのステップを見る →</button>
                <p v-else class="not-observed">この試行ではまだ観測されていません。事前記録では確認できます。</p>
              </div>
            </li>
          </ol>
          <h2>3つの値は、どこで照合する？</h2>
          <div class="table-scroll"><table class="lesson-table"><caption>state・nonce・PKCEの対応関係</caption><thead><tr><th scope="col">仕組み</th><th scope="col">結び付けるもの</th><th scope="col">このデモで確認する側</th></tr></thead><tbody>
            <tr><th scope="row"><a href="#learn/glossary/state">state</a></th><td>開始した要求と、ブラウザ経由の戻り</td><td>BFFの標準ハンドラー</td></tr>
            <tr><th scope="row"><a href="#learn/glossary/nonce">nonce</a></th><td>開始した認証要求と、IDトークン</td><td>BFFの標準ハンドラー</td></tr>
            <tr><th scope="row"><a href="#learn/glossary/pkce">PKCE</a></th><td>認可時のchallengeと、交換時のverifier</td><td>Keycloak</td></tr>
          </tbody></table></div>
          <details class="deep-dive"><summary>もう少し詳しく：図のすべてがHTTPの実測？</summary><p>いいえ。「HTTP実測」はBFFで観測した通信、「認証処理」はライブラリのイベントなどから確認した処理、「説明用」は説明のために補った出来事です。Keycloakのログイン画面や内部処理、Discovery / JWKS取得の通信を、この図で直接実測しているわけではありません。</p></details>
          <details class="deep-dive"><summary>コードと照らし合わせる：実装の入口</summary><ul class="reading-list"><li><code>OidcLens.Bff/Program.cs</code>：<code>AddOpenIdConnect</code>でCode Flow・form_post・PKCE・openidを設定。Cookieのセッションもここで構成します。</li><li><code>Auth/SignedIdTokenHandler.cs</code>：IDトークンの署名を必須にします。発行者・宛先などの検証には標準ライブラリを使います。</li><li><code>Tracing/TraceCapture.cs</code>：コード交換、マスクした項目、検証後のセッション確立を記録します。</li><li><code>Auth/MemoryTicketStore.cs</code>：BFFの認証情報をサーバー側に保持します。</li><li><code>Auth/ResourceAccess.cs</code>：保持していたアクセストークンでAPIを呼びます。</li><li><code>OidcLens.ResourceApi/Program.cs</code>：<code>AddJwtBearer</code>でAPIに届いたトークンを検証します。</li></ul><p>各パスは<code>src/</code>配下です。先頭にプロジェクト名のないパスは<code>OidcLens.Bff/</code>配下です。</p></details>
        </template>

        <template v-else-if="route.chapter === 'glossary'">
          <p class="lesson-lead">分からない単語は、その場で調べられます。項目名だけでなく「なぜ必要か」「このアプリでの使い方」も確認しましょう。</p>
          <div class="glossary-filters" role="search" aria-label="用語を検索">
            <label for="term-search">用語・説明を検索<span class="support-text" id="term-search-hint">例：nonce、宛先、Cookie</span><input id="term-search" v-model="search" type="search" aria-describedby="term-search-hint"></label>
            <label for="term-group">分類<select id="term-group" v-model="group"><option>すべて</option><option>登場人物</option><option>通信と設定</option><option>トークンと検証</option></select></label>
          </div>
          <p class="search-count" role="status">{{ filteredTerms.length }} / {{ glossary.length }}件</p>
          <p v-if="!filteredTerms.length" class="empty-terms">該当する用語がありません。別の言葉で検索するか、分類を「すべて」にしてください。</p>
          <div class="glossary-list">
            <section v-for="term in filteredTerms" :id="`term-${term.id}`" :key="term.id" class="glossary-entry" :class="{ 'target-term': route.term === term.id }" tabindex="-1">
              <span class="term-category">{{ term.group }}</span><h2>{{ term.label }}</h2><p>{{ term.meaning }}</p>
              <dl><div><dt>なぜ必要？</dt><dd>{{ term.why }}</dd></div><div><dt>このアプリでは</dt><dd>{{ term.here }}</dd></div></dl>
              <a class="source-link" :href="references[term.source].url" target="_blank" rel="noopener noreferrer">出典：{{ references[term.source].title }} ↗</a>
              <a v-if="route.term === term.id" class="term-return" :href="backHref">← {{ backLabel }}</a>
            </section>
          </div>
        </template>

        <template v-else>
          <p class="lesson-lead">間違えやすい説明を整理してから、最後に自分の言葉で確かめましょう。</p>
          <section class="misconceptions" aria-label="よくある誤解">
            <details v-for="item in misconceptions" :key="item.myth"><summary><span class="myth-label">よくある誤解</span>{{ item.myth }}</summary><p>{{ item.fact }}</p><a class="source-link" :href="references[item.source].url" target="_blank" rel="noopener noreferrer">出典：{{ references[item.source].title }} ↗</a></details>
          </section>
          <h2>理解チェック</h2><p>回答すると、その場で理由を確認できます。結果はこの画面内だけで保持します。</p>
          <div v-for="(question, index) in questions" :key="question.question" class="quiz-question">
            <fieldset><legend><span>Q{{ index + 1 }}.</span> {{ question.question }}</legend><label v-for="(option, optionIndex) in question.options" :key="option"><input v-model="answers[index]" type="radio" :name="`question-${index}`" :value="optionIndex">{{ option }}</label></fieldset>
            <div v-if="answers[index] !== undefined" class="quiz-feedback" role="status"><strong>{{ answers[index] === question.answer ? '正解です' : 'もう一度、役割を確認しましょう' }}</strong><p>{{ question.explanation }}</p><a :href="`#learn/${question.chapter}`">関連する章を読み直す →</a></div>
          </div>
          <div class="quiz-progress" role="status">{{ answeredCount }} / {{ questions.length }}問に回答 · {{ correctCount }}問正解 <button v-if="answeredCount" class="plain-button" type="button" @click="answers = {}">回答をリセット</button></div>
          <h2>参考資料の読み方</h2><p>最初から仕様書を通読する必要はありません。まずこのガイドとフローを見比べ、疑問が残った項目の原文を参照してください。ガイドは公式仕様と実装を照合して作成し、一般的な説明とこのデモ固有の動作を分けています。</p>
        </template>

        <footer class="lesson-sources"><h2>{{ route.chapter === 'review' ? '参考資料・出典一覧' : 'この章の出典' }}</h2><ul><li v-for="id in chapterSources" :key="id"><a :href="references[id].url" target="_blank" rel="noopener noreferrer">{{ references[id].title }} ↗</a><small>{{ references[id].note }}</small></li></ul></footer>
      </div>
      <nav class="chapter-pagination" aria-label="前後の章">
        <a v-if="chapterIndex > 0" :href="`#learn/${chapters[chapterIndex - 1]!.id}`">← {{ chapters[chapterIndex - 1]!.title }}</a><span v-else></span>
        <a v-if="chapterIndex < chapters.length - 1" :href="`#learn/${chapters[chapterIndex + 1]!.id}`">{{ chapters[chapterIndex + 1]!.title }} →</a><a v-else href="#flow">フローを観察する →</a>
      </nav>
    </article>
  </div>
</template>
