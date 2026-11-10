import type { TraceStep } from './flow'

export type JourneyActor = 'browser' | 'app' | 'provider' | 'api'
export interface JourneyMessage { from: JourneyActor; to: JourneyActor; via?: JourneyActor; label: string }
export interface JourneyPanel {
  title: string
  items: { label: string; text: string; stageId?: string }[]
}
export interface JourneyStage {
  id: string
  title: string
  shortTitle: string
  chapter: 'OIDCとは' | 'データを使うために' | 'ログインするまで' | 'ログインしたあと' | '規格を振り返る'
  question: string
  answer: string
  explanation: string
  messages: JourneyMessage[]
  traceIds: string[]
  terms: string[]
  panels?: JourneyPanel[]
}

export const journey: JourneyStage[] = [
  {
    id: 'oidc', title: 'OIDCは何を決める規格か', shortTitle: 'OIDCとは', chapter: 'OIDCとは',
    question: 'OIDCは、何を共通の約束にする規格？',
    answer: 'OAuth 2.0を土台に、アプリがユーザーの認証結果を受け取り、検証する方法を定めた規格です。',
    explanation: '認証サービスとアプリが同じ約束に従うことで、「誰が認証されたか」を共通の形式と手順で扱えます。このあと、APIで自分のデータを取得する例を通して、OAuth 2.0にOIDCが何を加えるのかを見ていきます。',
    panels: [
      { title: 'OAuth 2.0：土台となる認可の仕組み', items: [
        { label: '目的', text: 'アプリに、APIなどへの限定されたアクセスを許す。' },
        { label: 'アクセストークン', text: 'アプリがAPIを利用するときに提示する鍵。' },
      ] },
      { title: 'OIDC：ユーザー認証の仕組みを追加', items: [
        { label: '目的', text: '認証サービスでのユーザー認証の結果を、アプリへ伝える。' },
        { label: 'IDトークンと検証のルール', text: '誰が認証されたかを伝える形式と、その結果の確かめ方を定める。' },
      ] },
    ],
    messages: [], traceIds: [], terms: ['authentication', 'authorization'],
  },
  {
    id: 'start', title: '自分のデータを見たい', shortTitle: '自分のデータを見たい', chapter: 'データを使うために',
    question: 'アプリで、自分のデータを見るには？',
    answer: 'アプリが、データを提供するAPIに取得を依頼します。',
    explanation: 'データや機能をプログラムから使う窓口が「API」です。この教材では「リソースAPI」と呼び、それを提供してデータを守る役割を「リソースサーバー」と呼びます。アプリとAPIは役割の区別で、別のサービスや別のマシンである必要はありません。まずは、この窓口をどう守るかから考えます。',
    messages: [{ from: 'browser', to: 'app', label: 'このデータを見たい（/my-data）' }],
    traceIds: ['resource-request'], terms: [],
  },
  {
    id: 'protect', title: 'APIをそのまま公開したら', shortTitle: 'APIを守る理由', chapter: 'データを使うために',
    question: 'APIに要求が来たら、誰にでもデータを返してよい？',
    answer: 'アクセスを制限しなければ、他の人にも取得されてしまいます。',
    explanation: '自分のデータは、誰にでも見せたいものではありません。APIのURLを知っているだけで取得できるのでは困ります。APIには、利用を許された要求かどうかを確かめる仕組みが必要です。',
    messages: [
      { from: 'app', to: 'api', label: 'APIのURLに、データを求める' },
      { from: 'api', to: 'api', label: '誰に返してよいかを、どう判断する？' },
    ],
    traceIds: [], terms: ['resource'],
  },
  {
    id: 'key', title: 'アクセストークンを鍵にする', shortTitle: 'APIを使う鍵', chapter: 'データを使うために',
    question: '利用を許された要求だと、どう示す？',
    answer: 'アプリが「鍵」を添え、APIがその鍵を確かめます。',
    explanation: 'この鍵にあたるのが「アクセストークン」です。APIは、信頼する発行元が自分向けに発行したものか、期限内か、必要な権限があるかなどを確かめます。何でも開く鍵ではなく、使える相手・範囲・期限が決まった鍵です。',
    messages: [
      { from: 'app', to: 'api', label: 'アクセストークンを添えて要求する' },
      { from: 'api', to: 'api', label: 'トークンと、アクセスを許せるかを確認する' },
    ],
    traceIds: [], terms: ['access_token', 'authorization'],
  },
  {
    id: 'issue', title: '鍵をアプリに渡すには', shortTitle: '鍵をどう渡す？', chapter: 'データを使うために',
    question: 'その鍵は、誰が、どうやってアプリに渡す？',
    answer: 'トークンを発行するサービスが、許可された内容に応じて渡します。',
    explanation: '誰のデータを、どのアプリに、どこまで使わせるか。その許可を扱う仕組みが「OAuth 2.0」です。この教材では、認証サービスがトークンの発行も担当します。アプリはまず引換コードを受け取り、それをトークンに交換します。このあと、その手順をたどります。',
    messages: [
      { from: 'app', to: 'provider', label: '許可された範囲で使える鍵を求める' },
      { from: 'provider', to: 'provider', label: '発行の条件を確認する' },
    ],
    traceIds: [], terms: ['provider', 'code'],
  },
  {
    id: 'identity', title: 'OIDCが定める3つの約束', shortTitle: '認証結果を扱う共通の約束', chapter: 'ログインするまで',
    question: 'アプリへ認証結果を伝えるために、何を決める？',
    answer: 'OIDCは、認証の依頼方法・結果の形式・結果の検証方法を定めます。',
    explanation: 'APIを使うアクセストークンだけでは、アプリ向けのユーザー認証の結果を伝える共通の方法になりません。OIDCでは、次の約束を使って認証結果を扱います。ここからは、このアプリが選んだ「認可コードフロー」で、その約束がどう使われるかをたどります。',
    panels: [
      { title: '1. どう依頼するか', items: [
        { label: '認証リクエスト', text: 'scopeにopenidを含め、ユーザー認証を依頼する。', stageId: 'request' },
      ] },
      { title: '2. 何を受け取るか', items: [
        { label: 'IDトークン', text: '誰が認証されたかなどを、共通の項目を持つJWTとして受け取る。', stageId: 'tokens' },
      ] },
      { title: '3. どう確かめるか', items: [
        { label: '検証のルール', text: '発行者・宛先・期限や署名、要求との対応などを確かめる。', stageId: 'accept' },
      ] },
    ],
    messages: [], traceIds: [], terms: ['scope', 'id_token', 'jwt'],
  },
  {
    id: 'request', title: '本人確認をお願いする', shortTitle: '本人確認をお願いする', chapter: 'ログインするまで',
    question: '本人確認をしてもらうには？',
    answer: 'アプリが、認証サービスのログイン画面へ案内します。',
    explanation: 'アプリは、scopeにopenidを含めてOIDCの認証を依頼します。ブラウザがその依頼を認証サービスへ届けます。パスワードなどを入力するのは、そのサービスの画面です。',
    messages: [
      { from: 'app', to: 'browser', label: '認証サービスへ進んでください' },
      { from: 'browser', to: 'provider', label: 'この人の本人確認をお願いします' },
    ],
    traceIds: ['authorization-request', 'browser-navigation'], terms: ['redirect', 'scope'],
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
    answer: 'まず、トークンを受け取るための引換コードを返します。',
    explanation: '認証サービスが、ブラウザを通してアプリへ渡します。この引換コードの正式な名前が「認可コード」です。コード自体は、APIを使う鍵ではありません。アプリは次に、これを使ってアクセストークンと本人確認の結果を受け取ります。',
    messages: [
      { from: 'provider', to: 'browser', label: 'トークンを受け取るための引換コードを渡す' },
      { from: 'browser', to: 'app', label: '元のアプリに戻り、コードを渡す' },
    ],
    traceIds: ['idp-response', 'callback'], terms: ['code', 'state'],
  },
  {
    id: 'tokens', title: '鍵と本人確認の結果を受け取る', shortTitle: '鍵と結果を受け取る', chapter: 'ログインするまで',
    question: '引換コードを使って、何を受け取る？',
    answer: 'APIを使う「アクセストークン」と、本人確認の結果を記した「IDトークン」を受け取ります。',
    explanation: 'アプリは認証サービスへ直接、引換コードを渡します。認証サービスは、コードやアプリなどを確認して2種類のトークンを返します。アクセストークンはAPI向けの鍵、IDトークンはアプリ向けの本人確認の結果です。',
    messages: [
      { from: 'app', to: 'provider', label: '引換コードを渡して、結果を求める' },
      { from: 'provider', to: 'app', label: 'アクセストークンとIDトークンを返す' },
    ],
    traceIds: ['code-exchange', 'token-http', 'token-return'], terms: ['access_token', 'id_token'],
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
    id: 'api', title: 'リソースAPIからデータを取得する', shortTitle: 'APIからデータを取得する', chapter: 'ログインしたあと',
    question: '最初に見たかったデータは、どう届く？',
    answer: 'アプリが、受け取っておいた鍵「アクセストークン」をAPIへ送ります。',
    explanation: 'ここで、最初に考えた「鍵を添えてデータを求める」につながります。リソースAPIは、受け取ったトークンと権限を確かめてからデータを返します。本人確認の結果を伝えるIDトークンは、この鍵の代わりには使いません。',
    messages: [
      { from: 'app', to: 'api', label: 'アクセストークンを添えて、データを求める' },
      { from: 'api', via: 'app', to: 'browser', label: 'データがアプリに戻り、利用者へ届く' },
    ],
    traceIds: ['api-resource', 'resource-return', 'api-browser-return'], terms: ['access_token', 'resource'],
  },
  {
    id: 'review', title: 'どこがOIDCだったのか', shortTitle: '規格と実装を振り返る', chapter: '規格を振り返る',
    question: '今の手順の、どこがOIDCだった？',
    answer: '認証を依頼し、IDトークンを受け取り、検証する共通の約束がOIDCです。',
    explanation: 'OAuth 2.0のコード交換やアクセストークンの仕組みに、OIDCがユーザー認証を扱う約束を加えていました。Cookieによるログイン状態の維持やBFFは、このアプリが選んだ構成です。OIDCを使うすべてのアプリに同じ構成が必要なわけではありません。',
    panels: [
      { title: 'OIDCが定める共通の約束', items: [
        { label: '認証を依頼する', text: 'scope=openidを含むリクエスト。', stageId: 'request' },
        { label: '認証結果を受け取る', text: 'IDトークンと、その中の共通の項目。', stageId: 'tokens' },
        { label: '認証結果を検証する', text: '発行者・宛先・期限などを確かめるルール。', stageId: 'accept' },
      ] },
      { title: 'このアプリが選んだ実装・構成', items: [
        { label: 'Keycloak', text: '認証サービスとして使う製品。', stageId: 'authenticate' },
        { label: 'Cookieによるセッション', text: 'アプリのログイン状態を確認する方法。', stageId: 'continue' },
        { label: 'BFF', text: 'トークンの保持とAPIの呼び出しをサーバー側で行う構成。', stageId: 'api' },
      ] },
    ],
    messages: [], traceIds: [], terms: ['id_token', 'cookie', 'bff'],
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
