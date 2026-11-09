import type { TraceStep } from './flow'

export type JourneyActor = 'browser' | 'app' | 'provider' | 'api'
export interface JourneyMessage { from: JourneyActor; to: JourneyActor; via?: JourneyActor; label: string }
export interface JourneyStage {
  id: string
  title: string
  shortTitle: string
  chapter: 'ログインするまで' | 'ログインしたあと'
  question: string
  answer: string
  explanation: string
  messages: JourneyMessage[]
  traceIds: string[]
  terms: string[]
}

export const journey: JourneyStage[] = [
  {
    id: 'start', title: 'データを見る', shortTitle: 'データを見る', chapter: 'ログインするまで',
    question: 'このデータを表示してもよい？',
    answer: 'アプリは、あなたが誰かを確かめる必要があります。',
    explanation: 'ログインが必要なデータを見ようとしています。アプリは、あなたのアカウントを管理する別のサービスに本人確認を任せます。その相手を「認証サービス」と呼びます。',
    messages: [{ from: 'browser', to: 'app', label: 'このデータを見たい（/my-data）' }],
    traceIds: ['resource-request'], terms: [],
  },
  {
    id: 'request', title: '本人確認をお願いする', shortTitle: '本人確認をお願いする', chapter: 'ログインするまで',
    question: '本人確認をしてもらうには？',
    answer: 'アプリが、認証サービスのログイン画面へ案内します。',
    explanation: 'ブラウザは、アプリから受け取った依頼を認証サービスへ届けます。パスワードなどを入力するのは、そのサービスの画面です。',
    messages: [
      { from: 'app', to: 'browser', label: '認証サービスへ進んでください' },
      { from: 'browser', to: 'provider', label: 'この人の本人確認をお願いします' },
    ],
    traceIds: ['authorization-request', 'browser-navigation'], terms: ['redirect'],
  },
  {
    id: 'authenticate', title: '本人かどうかを確かめる', shortTitle: '本人を確認する', chapter: 'ログインするまで',
    question: 'あなたのアカウントだと、どう確かめる？',
    answer: '認証サービスが、本人かどうかを確かめます。',
    explanation: 'たとえば、そのサービスの画面でパスワードを入力します。認証サービスでは誰かわかりましたが、アプリにはまだ結果が届いていません。',
    messages: [
      { from: 'browser', to: 'provider', label: 'いつもの方法でログインする' },
      { from: 'provider', to: 'provider', label: 'あなたのアカウントであることを確認' },
    ],
    traceIds: ['user-authentication'], terms: ['authentication'],
  },
  {
    id: 'code', title: '引換コードを持ち帰る', shortTitle: 'アプリへ戻る', chapter: 'ログインするまで',
    question: '本人確認ができたら、アプリに何を返す？',
    answer: 'まず、本人確認の結果を受け取るための引換コードを返します。',
    explanation: '認証サービスが、ブラウザを通してアプリへ渡します。この引換コードの正式な名前が「認可コード」です。アプリは次に、これを使って本人確認の結果を受け取ります。',
    messages: [
      { from: 'provider', to: 'browser', label: '結果を受け取るための引換コードを渡す' },
      { from: 'browser', to: 'app', label: '元のアプリに戻り、コードを渡す' },
    ],
    traceIds: ['idp-response', 'callback'], terms: ['code', 'state'],
  },
  {
    id: 'tokens', title: '本人確認の結果を受け取る', shortTitle: '本人確認の結果を受け取る', chapter: 'ログインするまで',
    question: '引換コードを使って、何を受け取る？',
    answer: '本人確認の結果を記した「IDトークン」を受け取ります。',
    explanation: 'アプリは認証サービスへ直接、引換コードを渡します。認証サービスは、それと引き換えに「誰の本人確認ができたか」を記したデータを返します。',
    messages: [
      { from: 'app', to: 'provider', label: '引換コードを渡して、結果を求める' },
      { from: 'provider', to: 'app', label: '本人確認の結果を返す（IDトークン）' },
    ],
    traceIds: ['code-exchange', 'token-http', 'token-return'], terms: ['id_token'],
  },
  {
    id: 'accept', title: '結果を確かめて、ログインする', shortTitle: '確かめてログイン', chapter: 'ログインするまで',
    question: '受け取った結果を、そのまま信じていい？',
    answer: 'アプリが結果を確かめてから、あなたとしてログインさせます。',
    explanation: '決めておいた相手が発行したか、書き換えられていないか、このアプリ宛てか、期限内かなどを確かめます。ここで初めて、認証サービスでの本人確認が、アプリへのログインにつながります。',
    messages: [
      { from: 'app', to: 'app', label: '自分宛ての、本物の結果かを確かめる' },
      { from: 'app', to: 'browser', label: '確認できたので、あなたとしてログインさせる' },
    ],
    traceIds: ['session'], terms: ['signature', 'iss', 'aud', 'exp', 'nonce'],
  },
  {
    id: 'cookie', title: 'Cookieの仕組み', shortTitle: 'Cookieの仕組みを見る', chapter: 'ログインしたあと',
    question: 'Cookieって、そもそも何？',
    answer: 'サイトがブラウザに覚えてもらい、次のアクセスで送り返してもらうデータです。',
    explanation: 'たとえば「画面の表示設定」を覚えてもらえます。Cookieはログイン専用ではありません。サイトはブラウザから送られたデータを使って、前のアクセスとのつながりを扱えます。',
    messages: [
      { from: 'app', to: 'browser', label: 'このデータを覚えておいて（Cookie）' },
      { from: 'browser', to: 'app', label: '次のアクセスで、覚えていたデータを送る' },
    ],
    traceIds: [], terms: ['cookie'],
  },
  {
    id: 'continue', title: 'アプリを続けて使う', shortTitle: 'ログイン後のアクセスを見る', chapter: 'ログインしたあと',
    question: 'ページを開くたびに、本人確認をやり直すの？',
    answer: 'このアプリでは、Cookieを使ってログイン状態を確認します。',
    explanation: '本人確認が済むと、ブラウザは最初の /my-data にもう一度アクセスします。ログイン時に受け取った目印をCookieとして送ると、アプリは保存しているログイン状態を確認できます。',
    messages: [
      { from: 'browser', to: 'app', label: '同じ /my-data を、Cookieを付けて開く' },
      { from: 'app', to: 'app', label: '保存しているログイン状態を確認' },
    ],
    traceIds: ['api-browser'], terms: ['cookie'],
  },
  {
    id: 'api', title: '別のサービスのデータを使う', shortTitle: '別サービスのデータを使う', chapter: 'ログインしたあと',
    question: '最初に見たかったデータは、どう届く？',
    answer: 'アプリが、利用する権限を示す「アクセストークン」を送ります。',
    explanation: 'データや機能を他のプログラムから使えるようにする窓口を「API」と呼びます。相手のAPIは、受け取ったトークンと権限を確かめてからデータを返します。本人確認の結果を伝えるIDトークンとは、用途が異なります。',
    messages: [
      { from: 'app', to: 'api', label: 'アクセストークンを添えて、データを求める' },
      { from: 'api', via: 'app', to: 'browser', label: 'データがアプリに戻り、利用者へ届く' },
    ],
    traceIds: ['api-resource', 'resource-return', 'api-browser-return'], terms: ['access_token', 'resource'],
  },
]

export function stageIndexFromHash(hash: string): number {
  if (hash === '#after-login') return journey.findIndex(stage => stage.id === 'cookie')
  return Math.max(0, journey.findIndex(stage => stage.id === hash.split('/')[1]))
}
export function stageForTrace(stepId: string): JourneyStage | undefined {
  return journey.find(stage => stage.traceIds.includes(stepId))
}
// Teaching progression never fabricates a successful live record.
export function tracesForStage<T extends TraceStep>(stage: JourneyStage, steps: T[]): T[] {
  return steps.filter(step => stage.traceIds.includes(step.id))
}
