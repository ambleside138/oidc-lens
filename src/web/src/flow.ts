export type Actor = 'Browser' | 'App' | 'IdP' | 'Resource API'
type Source = 'http' | 'auth' | 'lesson'
type Channel = 'front' | 'back' | 'internal'

export interface TraceStep {
  id: string
  source: Source
  from: Actor
  to: Actor
  method?: string | null
  url?: string | null
  status?: number | null
  request?: Record<string, string> | null
  response?: Record<string, string> | null
  idToken?: {
    header: Record<string, string>
    payload: Record<string, string>
    result: 'session-established'
  } | null
}

export interface AttemptSummary {
  id: string
  startedAt: string
}

export interface AttemptDetails extends AttemptSummary {
  steps: TraceStep[]
}

export interface FlowStep extends TraceStep {
  title: string
  description: string
  channel: Channel
  diagramLabel: string
}

export const actorLabels: Record<Actor, string> = {
  Browser: '利用者のブラウザ', App: 'アプリ', IdP: '認証サービス', 'Resource API': '別サービスのAPI',
}
export const sources: Record<Source, string> = { http: '通信記録', auth: '処理記録', lesson: '説明用' }
export const channels: Record<Channel, string> = {
  front: 'ブラウザを通る', back: 'サーバー同士の通信', internal: '内部処理',
}

export function makeTimeline(trace: TraceStep[]): FlowStep[] {
  const steps: FlowStep[] = []
  const byId = new Map(trace.map(step => [step.id, step]))
  const add = (step: TraceStep | undefined, title: string, description: string, channel: Channel,
    diagramLabel = step?.method ?? '認証処理') => {
    if (step) steps.push({ ...step, title, description, channel, diagramLabel })
  }
  const lesson = (id: string, from: Actor, to: Actor): TraceStep => ({ id, from, to, source: 'lesson' })
  const redirect = byId.get('authorization-request')
  const callback = byId.get('callback')
  const exchange = byId.get('token-http')

  add(byId.get('resource-request'), 'データの取得を求める',
    'ブラウザが /my-data にアクセスしたときの記録です。アプリでまだログイン状態を確認できないため、本人確認へ進みます。', 'front', 'GET /my-data')

  add(redirect, '認証サービスへの案内',
    'アプリが「次は認証サービスのURLを開いてください」とブラウザに伝えた応答です。', 'front', '認証サービスへの移動先')
  if (redirect) {
    add(lesson('browser-navigation', 'Browser', 'IdP'), 'ブラウザが認証サービスに移動',
      'ブラウザは、アプリに案内されたURLを開き、本人確認の依頼を届けます。', 'front', '本人確認の依頼')
    add(lesson('user-authentication', 'IdP', 'IdP'), '認証サービスが本人を確認',
      '利用者が、認証サービスでいつもの方法でログインします。', 'internal', '本人確認')
  }
  if (callback) {
    add(lesson('idp-response', 'IdP', 'Browser'), '認証サービスが引換コードを渡す',
      '認証サービスは、本人確認の結果を受け取るための引換コードをブラウザに渡します。', 'front', '認可コード ＋ state')
  }
  add(callback, 'ブラウザがアプリにコードを届ける',
    'ブラウザが元のアプリに戻り、引換コードを渡したときの記録です。下のcodeが、その引換コードです。', 'front', '認可コード ＋ state')
  add(byId.get('code-exchange'), 'コード交換を開始',
    'アプリが、受け取った引換コードを使って本人確認の結果を求める処理に進みます。', 'internal', 'コード交換')
  add(exchange && { ...exchange, status: null, response: null }, 'トークンを要求',
    'アプリが認証サービスに直接、引換コードを送りました。', 'back', 'コード ＋ verifier')
  if (exchange?.status != null) {
    add({ ...exchange, id: 'token-return', from: exchange.to, to: exchange.from, request: null },
      'トークンエンドポイントの応答', 'トークンの項目が返ったかを表示します。', 'back', exchange.response?.id_token === 'present' ? 'ID Token / Access Token' : 'トークン応答')
  }
  add(byId.get('session'), 'IDトークンを確かめ、ログインさせる',
    'アプリが本人確認の結果を確かめ、利用者をログインさせたときの記録です。', 'internal', '確認してログイン')
  const apiBrowser = byId.get('api-browser')
  const apiResource = byId.get('api-resource')
  add(apiBrowser && { ...apiBrowser, status: null }, 'ログイン後のブラウザからの依頼',
    'ブラウザが、ログイン状態を確認するためのCookieをアプリに送った記録です。', 'front', 'Cookie')
  add(apiResource && { ...apiResource, status: null }, 'アクセストークンでデータを求める',
    'アプリが、利用する権限を示すアクセストークンを相手のAPIへ送ります。', 'back', 'Access Token')
  if (apiResource?.status != null) {
    add({ ...apiResource, id: 'resource-return', from: apiResource.to, to: apiResource.from, request: null },
      '別サービスからの応答', '相手のAPIが、アクセストークンを確かめた結果を返します。', 'back', '応答')
  }
  if (apiBrowser?.status != null) {
    add({ ...apiBrowser, id: 'api-browser-return', from: apiBrowser.to, to: apiBrowser.from, request: null },
      'ブラウザに呼び出し結果を返す', 'アプリが保護 API の呼び出し結果をブラウザに返します。', 'front', '応答')
  }
  return steps
}
