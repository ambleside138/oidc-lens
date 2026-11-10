import type { Actor, LogEntry, ReplayStep } from './replay'

export interface LabLog extends LogEntry { stepId: string; recordedAt: string }
export interface LabAttempt {
  id: string
  phase: string
  expiresAt: string
  logs: LabLog[]
  error: string | null
  nextRequest: string | null
  resourceMessage: string | null
  previousTokenResponse?: string | null
  hosts?: Partial<Record<Actor, string>> | null
}
export interface LabStatus { available: boolean; attempt: LabAttempt | null }

const definitions = [
  ['prepare', '要求を準備する', '認可サーバーの設定とPKCEを準備する', '信頼するKeycloakの設定を取得し、state・nonce・PKCEをサーバーで生成します。ここではまだ認可要求を送りません。', '（20）–（21）'],
  ['authorize', 'Keycloakへ移動する', '実際のKeycloakで本人確認と許可を行う', '実行ボタンでブラウザがKeycloakへ移動します。Keycloak内の画面操作は利用者が行い、その通信全体はこのアプリからは観測しません。', '（21）–（22）'],
  ['callback', 'コードを受け取る', 'コードを受領したところで待機する', 'ブラウザ経由で戻ったstateを照合し、コードをサーバーに保持します。まだトークン交換も、今回のログインも行っていません。', '（25）–（29）'],
  ['token', 'トークンに交換する', 'コードとverifierをKeycloakに送る', '条件を選んで実行すると、この時点でトークン要求を送ります。別のverifierで拒否された場合は、新しい試行の正常系と比較できます。', '（29）–（35）'],
  ['validate', '認証結果を検証する', '公開鍵でIDトークンを検証する', '実際の公開鍵を取得し、署名・発行者・宛先・期限・nonceなどを検証します。検証の成功とCookieの発行も分けています。', '（5）–（15）、（36）'],
  ['session', 'ログインを成立させる', 'サーバー側セッションとCookieを作る', '検証済みの認証結果を使ってアプリのログインを成立させます。トークンはサーバーに保持し、ブラウザにはセッションの参照を返します。', '（36）'],
  ['api', '保護APIを利用する', 'アクセストークンで実際のAPIを呼ぶ', 'ブラウザからの実行指示をCookieで確認し、サーバーがアクセストークンを使ってResource APIへ要求します。返った応答をそのまま確かめます。', '（29）–（36）'],
] as const

const internalCaptions: Record<string, string> = { prepare: 'state・nonce・PKCEを生成', callback: 'stateを照合して待機', token: '送信するverifierを選択', validate: '署名・claims・nonceを検証', session: 'セッションを作成' }
function caption(log: LabLog) {
  if (log.kind === 'internal') return log.label.includes('前のアプリ') ? '前のログインを終了' : log.label.includes('エラー説明') ? 'エラー種別を判定' : internalCaptions[log.stepId] ?? '内部処理'
  if (log.kind === 'request' && log.to === 'client') return 'ブラウザからの指示'
  if (log.stepId === 'prepare') return 'OPの設定'
  if (log.stepId === 'token') return log.kind === 'request' ? 'code + verifier' : 'トークンの発行結果'
  if (log.stepId === 'validate') return '署名検証用の公開鍵'
  if (log.stepId === 'session') return 'ログイン用Cookie'
  if (log.stepId === 'api') return log.kind === 'request' ? 'Bearerアクセストークン' : '保護APIの結果'
  return log.stepId === 'callback' ? 'code / state・画面への復帰' : '認可要求'
}
export function liveSteps(attempt: LabAttempt | null): ReplayStep[] {
  return definitions.map(([id, phase, title, summary, range]) => ({
    id, phase, title, summary, route: '実通信・実処理の記録',
    article: { protocol: 'oidc', range, connection: id === 'validate' ? '記事の「署名付き名刺」を、実際の鍵と署名で確かめます。' : '記事の概念を、この実験用クライアントで具体化しています。' },
    logs: (attempt?.logs.filter(log => log.stepId === id) ?? []).map(log => ({ ...log, diagramDetail: caption(log) })),
    inspect: [], result: '',
  }))
}
export function liveIndex(hash: string) {
  return Math.max(0, definitions.findIndex(item => item[0] === hash.split('/')[2]))
}
export function nextAction(phase?: string) {
  switch (phase) {
    case 'prepared': return { id: 'authorize', label: 'Keycloakで認証する', help: '実際のKeycloakへ移動します。本人確認と許可のあと、この画面に戻って待機します。' }
    case 'code-received': return { id: 'token', label: 'コードをトークンに交換する', help: 'この操作でPOST /tokenを送信します。応答後も検証とログインは自動で進めません。' }
    case 'tokens-received': return { id: 'validate', label: 'IDトークンを検証する', help: '公開鍵を取得して署名や内容を検証します。Cookieの発行は次の操作です。' }
    case 'validated': return { id: 'session', label: 'ログインを成立させる', help: '検証済みユーザーのセッションを作り、ログイン用Cookieを発行します。' }
    case 'session-established': return { id: 'api', label: '保護APIを呼ぶ', help: 'Cookieでこの試行のセッションを確認し、サーバーからBearer付きの要求を送ります。' }
    default: return null
  }
}
export function phaseLabel(phase?: string) {
  const labels: Record<string, string> = { preparing: '準備中', prepared: '認可要求の実行待ち', authorizing: 'Keycloakからの復帰待ち', 'code-received': 'コード受領済み・交換前', 'tokens-received': 'トークン受領済み・検証前', validated: '検証成功・Cookie発行前', 'session-established': 'ログイン成立・API実行前', complete: 'APIから200を受領', failed: '試行終了・ログを確認' }
  return phase ? labels[phase] ?? phase : '未開始'
}
