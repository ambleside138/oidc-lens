<script setup lang="ts">
import { actorLabels, channels, sources } from './flow'
import type { FlowStep } from './flow'
import { termForField } from './learning'
import InlineTerm from './InlineTerm.vue'
defineProps<{ step: FlowStep; recording: boolean }>()
const formatValue = (value: string) => ({ present: 'あり（値は非公開）', absent: 'なし' }[value] ?? value)
</script>

<template>
  <div class="trace-content">
    <div class="tags"><span>{{ sources[step.source] }}</span><span>{{ channels[step.channel] }}</span></div>
    <h3>{{ step.title }}</h3>
    <p>{{ step.description }}</p>
    <dl class="fields">
      <div v-if="step.source !== 'lesson'"><dt>記録した場所</dt><dd>アプリのサーバー</dd></div>
      <div><dt>経路</dt><dd>{{ actorLabels[step.from] }} → {{ actorLabels[step.to] }}</dd></div>
      <div v-if="step.method"><dt>Method</dt><dd><code>{{ step.method }}</code></dd></div>
      <div v-if="step.url"><dt>URL</dt><dd><code>{{ step.url }}</code></dd></div>
      <div v-if="step.status"><dt>Status</dt><dd><code>{{ step.status }}</code></dd></div>
    </dl>
    <section v-for="(fields, label) in { Request: step.request, Response: step.response }" :key="label">
      <template v-if="fields && Object.keys(fields).length">
        <h4>{{ label }} <span class="field-section-help">{{ label === 'Request' ? '送った要求' : '返された応答' }}</span></h4>
        <p v-if="label === 'Response' && fields.Location && step.id === 'authorization-request'" class="support-text">Locationには、移動先のURLが入ります。下の項目は、もとのURLの「?」以降に含まれる情報を分けて表示したものです。</p>
        <p v-else-if="label === 'Response' && fields.Location" class="support-text">Locationは、ブラウザが次に開くURLです。Set-Cookieは、ブラウザにCookieを覚えてもらうための項目です。</p>
        <dl class="fields"><div v-for="(value, key) in fields" :key="key">
          <dt><InlineTerm v-if="termForField(String(key))" :id="termForField(String(key))!" :label="String(key)" /><code v-else>{{ key }}</code></dt>
          <dd><code>{{ formatValue(value) }}</code></dd>
        </div></dl>
      </template>
    </section>
    <section v-if="step.idToken" class="inspector" aria-label="ID Token Inspector">
      <h4>IDトークンの中身</h4>
      <p class="support-text">受け取った内容です。「あり」は項目の存在を表し、その項目の確認に合格したかどうかを表すものではありません。</p>
      <section v-for="(fields, label) in { Header: step.idToken.header, Payload: step.idToken.payload }" :key="label">
        <h5>{{ label }} <span class="field-section-help">{{ label === 'Header' ? '形式や署名の情報' : '本人確認の結果など' }}</span></h5>
        <dl class="fields"><div v-for="(value, key) in fields" :key="key">
          <dt><InlineTerm v-if="termForField(String(key))" :id="termForField(String(key))!" :label="String(key)" /><code v-else>{{ key }}</code></dt>
          <dd><code>{{ formatValue(value) }}</code></dd>
        </div></dl>
      </section>
      <div class="validation-result"><strong>アプリの処理結果</strong><p>IDトークンの確認と後続の処理を終え、ログインできた記録です。確認項目ごとの合格・不合格は記録していません。</p><p v-if="recording">期限や処理結果は、記録した時点の情報です。</p></div>
    </section>
  </div>
</template>
