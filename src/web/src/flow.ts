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
}

export const sources: Record<Source, string> = { http: 'HTTP実測', auth: '認証処理', lesson: '教材' }
export const channels: Record<Channel, string> = {
  front: 'フロントチャネル', back: 'バックチャネル', internal: '内部処理',
}

export function makeTimeline(trace: TraceStep[]): FlowStep[] {
  const steps: FlowStep[] = []
  const byId = new Map(trace.map(step => [step.id, step]))
  const add = (step: TraceStep | undefined, title: string, description: string, channel: Channel) => {
    if (step) steps.push({ ...step, title, description, channel })
  }
  const lesson = (id: string, from: Actor, to: Actor): TraceStep => ({ id, from, to, source: 'lesson' })
  const redirect = byId.get('authorization-request')
  const callback = byId.get('callback')
  const exchange = byId.get('token-http')

  add(redirect, '認可リクエストへのリダイレクト',
    'アプリは認可エンドポイントを指す Location を返します。code_challenge_method は S256 です。', 'front')
  if (redirect) {
    add(lesson('browser-navigation', 'Browser', 'IdP'), 'ブラウザが Keycloak に移動',
      'ブラウザは Location に従い、認可リクエストを Keycloak に送ります。', 'front')
    add(lesson('user-authentication', 'IdP', 'IdP'), 'Keycloak がユーザーを認証',
      'Keycloak がログインを処理します。既存の SSO セッションがあれば、フォームが省略される場合があります。', 'internal')
  }
  if (callback) {
    add(lesson('idp-response', 'IdP', 'Browser'), 'Keycloak が認可コードを渡す',
      'Keycloak は認可コードと state を持つフォームをブラウザへ返します。', 'front')
  }
  add(callback, 'アプリへのコールバック',
    'ブラウザはフォームをアプリへ送信します。アプリは state と試行の相関を確認します。', 'front')
  add(byId.get('code-exchange'), 'コード交換を開始',
    '標準 OIDC ハンドラーが、認可コードと PKCE verifier を使う交換に進みます。', 'internal')
  add(exchange && { ...exchange, status: null, response: null }, 'トークンを要求',
    'アプリは Keycloak のトークンエンドポイントへサーバー間の POST を送ります。', 'back')
  if (exchange?.status != null) {
    add({ ...exchange, id: 'token-return', from: exchange.to, to: exchange.from, request: null },
      'トークンエンドポイントの応答', 'トークンの項目が返ったかを表示します。', 'back')
  }
  add(byId.get('session'), 'ID Token を検証しセッションを確立',
    '署名や nonce などの検証を終えたアプリが、ブラウザにセッション Cookie を発行しました。', 'internal')
  const apiBrowser = byId.get('api-browser')
  const apiResource = byId.get('api-resource')
  add(apiBrowser && { ...apiBrowser, status: null }, 'ブラウザから保護 API の呼び出しを依頼',
    'ブラウザはセッション Cookie をアプリに送ります。', 'front')
  add(apiResource && { ...apiResource, status: null }, 'Access Token で保護 API を呼び出す',
    'アプリはサーバーに保持していた Access Token を Bearer として送ります。', 'back')
  if (apiResource?.status != null) {
    add({ ...apiResource, id: 'resource-return', from: apiResource.to, to: apiResource.from, request: null },
      'Resource API の応答', 'Resource API が Access Token を検証し、HTTP ステータスを返します。', 'back')
  }
  if (apiBrowser?.status != null) {
    add({ ...apiBrowser, id: 'api-browser-return', from: apiBrowser.to, to: apiBrowser.from, request: null },
      'ブラウザに呼び出し結果を返す', 'アプリが保護 API の呼び出し結果をブラウザに返します。', 'front')
  }
  return steps
}
