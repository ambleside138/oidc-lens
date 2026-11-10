import type { LogEntry, ReplayStep } from './replay'

export interface SequenceEvent {
  log: LogEntry
  logIndex: number
  label: string
  detail: string
  y: number
}
export interface SequenceGroup {
  step: ReplayStep
  index: number
  current: boolean
  position: string
  y: number
  height: number
  events: SequenceEvent[]
}

// Short captions complement the literal HTTP method/status shown on each arrow.
const captions: Record<string, string[]> = {
  blocked: ['トークンなし', 'トークンの有無を確認', 'アクセスを拒否'],
  authorize: ['写真ページを開く', 'state・nonce・PKCEを保存', '認可サーバーへ案内'],
  provider: ['認可要求', '登録済みの要求か検査', '本人確認の画面'],
  consent: ['本人確認と許可', '認証・許可をコードに結び付ける', 'code + state'],
  callback: ['code + state', '保存したstateと照合'],
  token: ['code + verifier', 'コード・クライアント・PKCEを検査', 'Access Token / ID Token'],
  validate: ['公開鍵を取得', '署名検証用の公開鍵', '署名・iss・aud・exp・nonceを検証'],
  session: ['セッションを保存', 'Cookie + 写真ページのURL'],
  'browser-session': ['セッションCookie', 'セッションからトークンを取得'],
  api: ['Bearerアクセストークン'],
  resource: ['トークンの有効性を照会', '有効性と権限', '権限と対象データを確認', '写真データ（JSON）'],
  complete: ['写真ページ（HTML）', '受け取った画面を描画'],
}

function messageLabel(log: LogEntry): string {
  if (log.kind === 'internal') return '内部処理'
  const firstLine = log.wire.split('\n')[0]!
  if (log.kind === 'response') return firstLine.replace('HTTP/1.1 ', '')
  const [method, target] = firstLine.split(' ')
  return `${method} ${target!.split('?')[0]}`
}

export function makeSequenceWindow(steps: ReplayStep[], selectedIndex: number) {
  let y = 70
  const groups: SequenceGroup[] = []
  for (const index of [selectedIndex - 1, selectedIndex, selectedIndex + 1]) {
    const step = steps[index]
    if (!step) continue
    const current = index === selectedIndex
    let entries = step.logs.map((log, logIndex) => ({ log, logIndex }))
    if (!current) {
      const http = entries.filter(entry => entry.log.kind !== 'internal')
      const context = index < selectedIndex ? http.at(-1) ?? entries.at(-1) : http[0] ?? entries[0]
      entries = context ? [context] : []
    }
    const height = 30 + Math.max(1, entries.length) * 56 + 8
    groups.push({
      step, index, current, y, height,
      position: current ? '表示中' : index < selectedIndex ? (entries.length ? '前の場面・最後の通信' : '前の場面・未記録') : (entries.length ? '次の場面・最初の通信' : '次の場面・未記録'),
      events: entries.map(({ log, logIndex }, offset) => ({
        log, logIndex, label: messageLabel(log), detail: log.diagramDetail ?? captions[step.id]?.[logIndex] ?? log.label,
        y: y + 32 + offset * 56,
      })),
    })
    y += height + 8
  }
  return { groups, height: y + 8 }
}
