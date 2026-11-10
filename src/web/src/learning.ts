export const chapters = [
  { id: 'basics', title: 'OIDCは何を解決するのか', summary: '認証・認可と、登場人物の役割' },
  { id: 'oauth', title: 'OAuth 2.0とOIDCの違い', summary: 'APIへのアクセスと、ログインの関係' },
  { id: 'tokens', title: '2種類のトークンを使い分ける', summary: '目的・宛先・検証する人を比較' },
  { id: 'walkthrough', title: 'このアプリのログインをたどる', summary: 'コード交換から、セッションとAPIまで' },
  { id: 'glossary', title: '画面・コードの用語辞典', summary: '意味・必要な理由・登場する場所' },
  { id: 'review', title: 'よくある誤解と理解チェック', summary: 'つまずきの整理と、解説付きの問題' },
] as const

export type ChapterId = typeof chapters[number]['id']
export interface LearningRoute { chapter: ChapterId; term?: string }

export function parseLearningHash(hash: string): LearningRoute | null {
  if (!/^#learn(?:\/|$)/.test(hash)) return null
  const [, chapter, term] = hash.split('/')
  return {
    chapter: chapters.some(item => item.id === chapter) ? chapter as ChapterId : 'basics',
    term: chapter === 'glossary' && glossary.some(item => item.id === term) ? term : undefined,
  }
}

export const references = {
  core: { title: 'OpenID Connect Core 1.0', url: 'https://openid.net/specs/openid-connect-core-1_0.html', note: '認証、IDトークン、Claim、検証の仕様' },
  oauth: { title: 'RFC 6749 — OAuth 2.0', url: 'https://www.rfc-editor.org/rfc/rfc6749.html', note: '登場人物、認可コード、アクセストークン' },
  pitfalls: { title: 'OAuth.net — User Authentication with OAuth 2.0', url: 'https://oauth.net/articles/authentication/', note: 'OAuthをログインに使うときの代表的な誤解' },
  bearer: { title: 'RFC 6750 — Bearer Token Usage', url: 'https://www.rfc-editor.org/rfc/rfc6750.html', note: 'AuthorizationヘッダーとBearerの意味' },
  jwt: { title: 'RFC 7519 — JSON Web Token', url: 'https://www.rfc-editor.org/rfc/rfc7519.html', note: 'JWTの構造と署名・暗号化の区別' },
  pkce: { title: 'RFC 7636 — PKCE', url: 'https://www.rfc-editor.org/rfc/rfc7636.html', note: 'code_verifierとcode_challengeの関係' },
  security: { title: 'RFC 9700 — OAuth 2.0 Security BCP', url: 'https://www.rfc-editor.org/rfc/rfc9700.html', note: '現在の安全なフローと攻撃への対策' },
  discovery: { title: 'OpenID Connect Discovery 1.0', url: 'https://openid.net/specs/openid-connect-discovery-1_0.html', note: '設定情報と署名検証用の公開鍵の取得' },
  form: { title: 'OAuth 2.0 Form Post Response Mode', url: 'https://openid.net/specs/oauth-v2-form-post-response-mode-1_0.html', note: 'ブラウザがフォームでコードを返す方式' },
  bff: { title: 'RFC 10017 — OAuth 2.0 for Browser-Based Applications', url: 'https://www.rfc-editor.org/rfc/rfc10017.html#section-6.1', note: 'BFFによるトークンの保持とブラウザのセッション' },
  cookie: { title: 'RFC 6265 — HTTP Cookies', url: 'https://www.rfc-editor.org/rfc/rfc6265.html', note: 'ブラウザがCookieを保存し、条件に合う要求で送る仕組み' },
  http: { title: 'RFC 9110 — HTTP Semantics', url: 'https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.2', note: 'Locationとページ移動の関係' },
} as const

export type ReferenceId = keyof typeof references
type Group = '登場人物' | '通信と設定' | 'トークンと検証'
export interface GlossaryTerm {
  id: string
  label: string
  group: Group
  meaning: string
  why: string
  here: string
  source: ReferenceId
}

// Meanings describe the protocol; `here` explicitly describes this implementation.
export const glossary: GlossaryTerm[] = [
  { id: 'authentication', label: '認証 / Authentication', group: '登場人物', meaning: '誰としてアクセスしているかを確認すること。認可とは別の問いです。', why: '他のユーザーになりすましたアクセスを防ぎ、利用者を識別するためです。', here: 'Keycloakがユーザーを認証し、BFFがその結果を検証します。現実世界の本人確認（身分証の確認など）を自動的に保証するものではありません。', source: 'core' },
  { id: 'authorization', label: '認可 / Authorization', group: '登場人物', meaning: 'ある操作やリソースへのアクセスを許すこと。OAuthはクライアントへの限定されたアクセス権の付与を扱います。', why: '誰であるか分かっても、すべての操作を許すわけにはいかないためです。', here: '保護APIは有効なアクセストークンを要求します。業務上のロールやレコード単位の権限制御は教材に含めていません。', source: 'oauth' },
  { id: 'browser', label: 'Browser / User Agent', group: '登場人物', meaning: 'ユーザーが操作し、Webページの表示やリダイレクト、フォーム送信を行うブラウザです。', why: 'アプリとIdPの間をユーザーが移動する経路になります。', here: '図のBrowser。コードとstateをBFFへ運び、ログイン後はセッションCookieを送ります。', source: 'oauth' },
  { id: 'client', label: 'Client / RP（Relying Party）', group: '登場人物', meaning: 'OAuthのClientはリソースへのアクセスを求めるアプリ。OIDCで認証結果を受け取るClientをRPとも呼びます。', why: '認証結果の受け手と、APIそのものを区別するためです。', here: '図のAppにあるASP.NET Core BFFがClient / RPです。「クライアント」は必ずしもブラウザを意味しません。', source: 'core' },
  { id: 'provider', label: 'IdP / OP / Authorization Server', group: '登場人物', meaning: 'Authorization Serverはトークンを発行する役割。OIDCに対応しユーザー認証を提供するサーバーをOP（OpenID Provider）と呼びます。IdPは認証情報の提供元を指す広い呼び名です。', why: 'アプリ自身がパスワードを集めず、信頼する提供元の認証結果を受け取るためです。', here: '図のIdPはKeycloak。demo Realmがユーザー認証とトークン発行を担当します。', source: 'core' },
  { id: 'resource', label: 'Resource Server / Resource API', group: '登場人物', meaning: '保護されたデータや機能を提供し、アクセストークンを受け付けるサーバーです。', why: 'トークンの発行元と、それを使う宛先は役割が異なるためです。', here: 'Resource APIの /protected。署名・発行者・宛先・期限などを検証して応答します。', source: 'oauth' },
  { id: 'bff', label: 'BFF（Backend for Frontend）', group: '登場人物', meaning: 'ブラウザ向けの処理を引き受けるバックエンドの構成です。OIDCの必須要素ではありません。', why: 'トークンの保持や外部APIの呼び出しを、ブラウザの代わりにサーバーで行えます。', here: '図のApp。ブラウザとはCookie、Resource APIとはアクセストークンで通信します。', source: 'bff' },
  { id: 'sso', label: 'SSO（Single Sign-On）', group: '登場人物', meaning: '既存の認証状態を利用し、複数のアプリで繰り返しのログイン操作を減らす仕組みです。', why: 'IdPですでに認証されていれば、再度パスワードを入力せずに済む場合があります。', here: 'Keycloakにセッションがある場合、ログイン画面が省略されることがあります。OIDC導入だけで全アプリのセッションやログアウトが連動するわけではありません。', source: 'core' },
  { id: 'endpoint', label: 'Endpoint（エンドポイント）', group: '通信と設定', meaning: '特定の処理を受け付けるURLです。認可エンドポイントとトークンエンドポイントは役割が異なります。', why: 'ユーザーを移動させる先と、コードを交換する先を使い分けるためです。', here: 'Keycloakの /auth にブラウザが移動し、/token にはBFFがPOSTします。', source: 'core' },
  { id: 'redirect', label: 'Redirect / Location', group: '通信と設定', meaning: 'サーバーがブラウザに「次はこちらのURLを開いてください」と案内する仕組みです。ページ移動を指示する応答では、Locationに行き先が入ります。', why: 'ページの移転先や、フォーム送信後の完了画面などへ案内できます。この教材では、本人確認を任せる相手へ案内するために使います。', here: '未ログインで /my-data を開くと、302応答で認証サービスへ案内します。本人確認のあと、同じ /my-data へ戻ります。表示では、移動先URLの「?」以降の項目を分けています。', source: 'http' },
  { id: 'redirect_uri', label: 'redirect_uri / Callback', group: '通信と設定', meaning: '認可処理の結果を受け取る、登録済みの戻り先URLです。その戻りの処理をコールバックと呼びます。', why: 'コードを意図しないサイトへ送らないため、登録内容との一致を確認します。', here: 'BFFの /signin-oidc。Keycloakからの結果をブラウザ経由で受け取ります。', source: 'oauth' },
  { id: 'client_id', label: 'client_id', group: '通信と設定', meaning: '登録済みのアプリを識別するID。パスワードのような秘密情報ではありません。', why: 'どのアプリが、どの設定で認可・認証を要求しているか識別するためです。', here: 'BFFのClientIdに設定され、認可リクエストやIDトークンの宛先の確認で使われます。', source: 'oauth' },
  { id: 'client_secret', label: 'client_secret / Confidential Client', group: '通信と設定', meaning: 'シークレットを安全に保持できるClientをConfidential Clientと呼びます。client_secretはアプリ自身の認証に使う資格情報の一つです。', why: 'ユーザーの認証と、コードを交換するアプリの認証を区別するためです。', here: 'BFFがサーバー側で保持します。ユーザーのパスワードではなく、ブラウザへ配布する値でもありません。', source: 'oauth' },
  { id: 'scope', label: 'scope / openid', group: '通信と設定', meaning: '求めるアクセス範囲などを表す文字列の集合。openidはOIDCの認証要求であることを示す特別なスコープです。', why: '何を求めるリクエストなのかを提供元に伝えるためです。', here: 'BFFはscope=openidを要求します。profileやemailは追加の情報を求めるスコープで、業務上の管理者ロールとは別です。', source: 'core' },
  { id: 'response_type', label: 'response_type', group: '通信と設定', meaning: '認可エンドポイントから、どの種類の結果を返してほしいか指定します。', why: '認可コードを使うフローかどうかを伝えるためです。', here: 'codeを指定し、ブラウザ経由ではトークンではなく認可コードを受け取ります。', source: 'oauth' },
  { id: 'response_mode', label: 'response_mode / form_post', group: '通信と設定', meaning: '認可結果をどの方法で戻すかを指定します。form_postではHTMLフォームをブラウザがPOSTします。', why: '何を返すか（response_type）と、どう運ぶかを分けて指定するためです。', here: 'form_postを使用。codeとstateは /signin-oidc へのフォーム本文で送られます。', source: 'form' },
  { id: 'grant_type', label: 'grant_type', group: '通信と設定', meaning: 'トークンエンドポイントで、何を根拠にトークンを求めるかを指定します。', why: '認可コードによる交換と、更新トークンによる更新などを区別するためです。', here: 'authorization_codeを指定し、codeとcode_verifierを送って交換します。', source: 'oauth' },
  { id: 'channel', label: 'フロントチャネル / バックチャネル', group: '通信と設定', meaning: 'フロントチャネルはブラウザを経由するやり取り。バックチャネルはサーバー同士などの直接のやり取りです。', why: '誰がコードやトークンを運ぶかを見分けるためです。', here: '実線はブラウザ経由、破線はBFFとKeycloak・APIの間の通信。点は同じ登場人物の内部処理です。', source: 'core' },
  { id: 'code', label: 'code（認可コード）', group: 'トークンと検証', meaning: 'トークンを取得するための、短寿命で一度だけ使うコードです。アクセストークンそのものではありません。', why: 'ブラウザ経由でトークンを直接運ばず、トークンエンドポイントで交換するためです。', here: 'ブラウザがBFFへ運び、BFFがKeycloakへ送り直します。値は履歴に保存しません。', source: 'oauth' },
  { id: 'id_token', label: 'ID Token（IDトークン）', group: 'トークンと検証', meaning: 'ユーザー認証についての情報を、Client向けに伝えるJWTです。', why: '誰が、どの提供元で認証されたかを、アプリが検証できる形で受け取るためです。', here: 'BFFが検証してログインを成立させます。Resource APIを呼び出す資格情報には使いません。', source: 'core' },
  { id: 'access_token', label: 'Access Token（アクセストークン）', group: 'トークンと検証', meaning: '対象リソースへのアクセスに使う資格情報。形式はJWTとは限りません。', why: 'ユーザーのパスワードをAPIに渡さず、許された範囲のアクセスを行うためです。', here: 'BFFがサーバー側に保持し、Resource APIへ送ります。このKeycloakの構成ではJWTですが、クライアントが中身に依存してログインを判断するものではありません。', source: 'oauth' },
  { id: 'refresh_token', label: 'Refresh Token（更新トークン）', group: 'トークンと検証', meaning: '新しいアクセストークンを要求するための資格情報。APIへ送るトークンではありません。', why: 'ユーザーに毎回ログイン操作を求めず、アクセスを継続する用途があります。', here: '事前記録には発行されたことが表示されますが、BFFは更新トークンを保存せず、自動更新も実装していません。', source: 'oauth' },
  { id: 'cookie', label: 'Cookie / ログイン状態', group: 'トークンと検証', meaning: 'サイトがブラウザに覚えてもらうデータです。ブラウザは、送り先や期限などの条件に合うアクセスで、そのデータを送ります。表示設定の保存などにも使えます。', why: 'サイトが前のアクセスとのつながりを扱えます。ログイン専用の仕組みではありません。', here: 'このアプリでは、サーバー側に保存したログイン状態を確認するための目印をCookieに入れます。アクセストークンはブラウザへ渡さず、サーバー側に保存します。', source: 'cookie' },
  { id: 'bearer', label: 'Bearer / Authorization / token_type', group: 'トークンと検証', meaning: 'Bearerは、トークンの所持によってアクセスする方式です。AuthorizationはHTTPヘッダー名、token_typeは発行されたトークンの使い方を示す項目です。', why: 'APIへ資格情報を渡す方法を指定するためです。Bearerトークンを盗まれると他者に使われ得るため、値を保護します。', here: 'BFFが Authorization: Bearer … をResource APIへ送ります。画面には値を出さず、方式だけを表示します。', source: 'bearer' },
  { id: 'state', label: 'state', group: 'トークンと検証', meaning: '認可リクエストと、その戻りの応答を結び付ける値です。ブラウザのセッションと結び付けて検証することでCSRF対策に使います。', why: '開始していないログインの結果を、自分のログインとして受け入れないためです。', here: '標準OIDCハンドラーが保護したstateと相関Cookieを確認し、ログイン試行の情報を復元します。', source: 'security' },
  { id: 'nonce', label: 'nonce', group: 'トークンと検証', meaning: '認証要求と、その結果のIDトークンを結び付ける一度限りの値です。', why: '別の認証結果の流用や差し替えを検知するためです。送った値とIDトークン内の値を照合します。', here: '標準ハンドラーが照合します。Inspectorでは値の有無だけを表示し、照合用の値は公開しません。', source: 'security' },
  { id: 'pkce', label: 'PKCE / code_verifier / code_challenge / S256', group: 'トークンと検証', meaning: 'コードを交換する側が、最初の要求を出した側であることを確かめる仕組み。ランダムなcode_verifierからcode_challengeを作ります。S256はSHA-256とBase64urlで変換する方式です。', why: 'コードを奪っただけの相手がトークンへ交換することを防ぐためです。シークレットによるクライアント認証とは別の仕組みです。', here: '認可時にchallenge、交換時にverifierを送り、Keycloakが対応を検証します。BFFでもPKCE S256を使用します。', source: 'pkce' },
  { id: 'jwt', label: 'JWT / Header / Payload', group: 'トークンと検証', meaning: 'ClaimをJSONで表すトークン形式です。Headerは暗号処理などの情報、PayloadはClaimの内容です。署名されたJWTと暗号化されたJWTは区別が必要です。', why: '形式と用途を分けて考えるためです。JWTという形式だけでは、IDトークンかアクセストークンかは分かりません。', here: 'InspectorでIDトークンのHeader / Payloadを表示します。Base64urlのデコードは署名検証でも復号でもありません。', source: 'jwt' },
  { id: 'claim', label: 'Claim（クレーム）', group: 'トークンと検証', meaning: 'ある対象についての情報を表す名前と値の組です。例えばiss、sub、audなどです。', why: '発行者、ユーザー、宛先などを共通の名前で伝えるためです。', here: 'InspectorのPayloadに表示します。値を読めることと、その内容を信頼できることは別です。', source: 'core' },
  { id: 'iss', label: 'iss（Issuer）', group: 'トークンと検証', meaning: 'トークンを発行した提供元の識別子です。', why: '信頼している提供元が発行したものかを確認するためです。署名が有効でも別の発行者では受け入れません。', here: 'Keycloakのdemo RealmのURL。BFFとResource APIは期待する発行者を確認します。', source: 'core' },
  { id: 'sub', label: 'sub（Subject）', group: 'トークンと検証', meaning: '発行者のもとでユーザーを識別するIDです。表示名やメールアドレスとは別です。', why: '同姓同名やメールアドレス変更に依存せずに利用者を識別するためです。OIDCではissとsubの組を基本に扱います。', here: '個人に結び付く値のため、Inspectorには有無だけを表示します。', source: 'core' },
  { id: 'aud', label: 'aud（Audience）', group: 'トークンと検証', meaning: 'トークンが誰に向けて発行されたかを表す宛先です。', why: '別のアプリやAPI用のトークンを誤って受け入れないためです。', here: 'IDトークンではBFFのclient_idを確認します。Resource APIはアクセストークンの宛先が自分を含むことを確認します。', source: 'core' },
  { id: 'exp', label: 'exp（Expiration Time）', group: 'トークンと検証', meaning: 'トークンの有効期限。JWTでは通常、Unix時刻の秒数で表します。', why: '期限切れの資格情報を受け入れないためです。', here: 'Inspectorでは読みやすい日時へ変換しています。事前記録は採取時の結果であり、今この瞬間に有効と判定し直しているわけではありません。', source: 'jwt' },
  { id: 'iat', label: 'iat（Issued At）', group: 'トークンと検証', meaning: 'トークンが発行された時刻です。ユーザーが認証された時刻（auth_time）とは別です。', why: '発行時期や経過時間を把握するためです。期限のexpとも役割が異なります。', here: '用語として紹介しますが、現在のInspectorでは表示対象にしていません。', source: 'jwt' },
  { id: 'alg', label: 'alg / RS256', group: 'トークンと検証', meaning: 'algは署名や暗号処理のアルゴリズムを表すHeader項目。RS256はRSAとSHA-256による署名方式です。', why: '受け手があらかじめ許可した方式で署名を確認するためです。トークンが指定した方式を無条件に信じません。', here: 'BFFとResource APIはこのデモでRS256を許可します。署名は内容を隠す暗号化ではありません。', source: 'jwt' },
  { id: 'kid', label: 'kid（Key ID）', group: 'トークンと検証', meaning: '署名検証などに使う鍵を選ぶための識別子です。鍵そのものでも、信頼の証明でもありません。', why: '鍵の更新などで複数の公開鍵があるとき、候補を選ぶためです。', here: '信頼する提供元のJWKSから鍵を選びます。画面ではkidの有無のみを表示します。', source: 'discovery' },
  { id: 'typ', label: 'typ（Type）', group: 'トークンと検証', meaning: 'Headerではトークン形式などを示す情報です。Payloadに同名の項目がある場合、その意味は発行元の仕様によります。', why: '同じ項目名でも、置かれる場所や発行元によって意味が違うためです。', here: 'InspectorのHeaderのtyp=JWTだけで用途は判定できません。APIは署名・宛先などの検証に加え、Keycloak固有のPayloadのtyp=Bearerも確認します。', source: 'jwt' },
  { id: 'signature', label: '署名 / 検証 / デコード', group: 'トークンと検証', meaning: 'デコードは内容を読める形にすること。署名検証は信頼する鍵で改ざんなどを確認すること。トークンの検証には宛先や期限などの確認も含みます。', why: '攻撃者が作ったJSONを、読めるというだけで信用しないためです。', here: '署名検証には標準ライブラリとDiscovery由来の鍵を使います。認証処理の結果は、後続検証とセッション確立を終えてから表示します。', source: 'core' },
  { id: 'discovery', label: 'Discovery / JWKS', group: 'トークンと検証', meaning: 'Discoveryは提供元の設定情報を取得する仕組み。JWKSは署名検証などに使う公開鍵の集合です。', why: 'エンドポイントや鍵の情報を、設定した信頼先から取得するためです。トークン内の任意のURLから鍵を取得してよいわけではありません。', here: '標準ライブラリが使用します。取得通信自体は現在のシーケンス図では観測・表示していません。', source: 'discovery' },
  { id: 'error', label: 'error / invalid_grant', group: '通信と設定', meaning: '処理が失敗した理由を表す応答項目。invalid_grantはコードなどの認可の根拠が無効な場合に使われます。', why: '成功した応答と失敗した応答を区別するためです。', here: 'コールバックにはerrorの有無を表示できます。現在の教材は正常系が中心で、失敗原因を個別に診断する機能はありません。', source: 'oauth' },
]

const fieldAliases: Record<string, string> = {
  Location: 'redirect', Cookie: 'cookie', 'Set-Cookie': 'cookie', Authorization: 'bearer', token_type: 'bearer',
  code_challenge: 'pkce', code_challenge_method: 'pkce', code_verifier: 'pkce',
}

// Short definitions stay with the lesson. Detailed implementation notes live in the dictionary.
export function briefMeaning(id: string, field?: string): string {
  const meanings: Record<string, string> = {
    redirect: 'サーバーがブラウザに「次はこちらのURLを開いてください」と案内することです。この応答では、Locationに行き先のURLが入ります。リンクをクリックして直接ページを開く場合とは異なります。',
    authentication: 'アクセスしている人が、そのアカウントの本人かを確かめることです。',
    code: '本人確認の結果を受け取るための、一時的な引換コードです。アプリは認証サービスにこのコードを渡して、結果を受け取ります。',
    id_token: '「誰の本人確認ができたか」をアプリに伝えるデータです。アプリは、本物か、自分宛てか、期限内かなどを確かめてから使います。',
    access_token: 'リソースAPIにデータや機能の利用を求めるときに提示するものです。APIが、トークンと権限を確かめます。',
    cookie: 'サイトがブラウザに覚えてもらうデータです。ブラウザは、送り先や期限などの条件に合うアクセスで、そのデータを通信に付けて送ります。表示設定の保存などにも使われ、ログイン専用ではありません。',
    resource: 'データや機能を、他のプログラムから使えるようにする窓口がAPIです。この教材のリソースAPIは、利用する権限を示すアクセストークンを求めます。',
    signature: '発行元がデータに付けた署名を使い、信頼している相手が発行したことや、内容が書き換えられていないことを確かめます。',
    iss: 'IDトークンの発行元です。アプリが信頼すると決めておいた相手と一致するかを確かめます。',
    aud: 'トークンの宛先です。このアプリ向けに発行されたIDトークンかを確かめます。',
    exp: 'トークンの有効期限です。受け入れる時点で、期限内かを確かめます。',
    sub: '認証サービスの中で、その利用者を識別する値です。',
    nonce: 'アプリが最初の依頼に付けた値と、返ってきたIDトークンの値を照合します。今回の依頼に対する結果かを確認するためです。',
    state: 'アプリが始めた依頼と、ブラウザが持ち帰った応答の対応を確認するための値です。',
    client_id: '認証サービスに登録されたアプリを識別する値です。',
    redirect_uri: '本人確認が終わったあと、ブラウザが結果を届けるアプリ側のURLです。あらかじめ登録しておきます。',
    response_type: 'ブラウザに何を返してほしいかの指定です。codeは、認可コードという引換コードを返してほしい、という意味です。',
    response_mode: '結果をブラウザからアプリへ、どの方法で届けるかの指定です。form_postはフォームの送信と同じ方法で届ける指定です。',
    scope: '求めるアクセス範囲などの指定です。openidを含めると、本人確認の結果をIDトークンとして受け取るための依頼になります。',
    pkce: '引換コードを横取りした相手が、そのコードを使うのを防ぐ仕組みです。最初の依頼に付けた確認用の値と、コードを渡すときの値が対応するかを認証サービスが確かめます。',
    grant_type: '何を使ってトークンを受け取りたいかの指定です。authorization_codeは、引換コードを使うという指定です。',
    client_secret: '認証サービスに、登録済みのアプリ自身であることを示すための秘密の値です。利用者のパスワードとは別です。',
    refresh_token: '新しいアクセストークンを受け取るために使うものです。アクセストークンは、リソースAPIを利用するときに提示します。',
    bearer: 'アクセストークンを通信に付けて提示する方式です。Authorizationという項目に、Bearerという方式名とトークンを入れます。',
    jwt: 'データの形式名です。Headerには形式や署名に関する情報、Payloadには本人確認の結果などの内容が入っています。',
    alg: 'データに付ける署名の方式です。RS256は、その方式の名前です。',
    kid: '発行元が付けた署名を確認するとき、どの鍵を使うかを識別する値です。',
    typ: 'データの形式などを示す項目です。JWTは形式の名前です。',
    error: '処理が失敗した場合の情報です。',
  }
  if (id === 'cookie' && field === 'Set-Cookie') return 'サイトがブラウザにCookieを覚えてもらうため、応答に付ける項目です。覚えたCookieは、次のアクセスでブラウザから送られます。'
  return meanings[id] ?? glossary.find(term => term.id === id)?.meaning ?? ''
}

export function termForField(field: string): string | undefined {
  const id = fieldAliases[field] ?? field
  return glossary.some(term => term.id === id) ? id : undefined
}

const stepTerms: Record<string, string[]> = {
  'resource-request': ['browser', 'cookie', 'authentication'],
  'authorization-request': ['client', 'provider', 'redirect', 'scope', 'state', 'nonce', 'pkce'],
  'browser-navigation': ['browser', 'endpoint', 'channel'],
  'user-authentication': ['authentication', 'provider', 'sso'],
  'idp-response': ['code', 'response_mode', 'state'],
  callback: ['redirect_uri', 'code', 'state'],
  'code-exchange': ['code', 'pkce', 'client_secret'],
  'token-http': ['endpoint', 'grant_type', 'pkce', 'client_secret'],
  'token-return': ['id_token', 'access_token', 'refresh_token'],
  session: ['id_token', 'signature', 'nonce', 'cookie'],
  'api-browser': ['bff', 'cookie'],
  'api-resource': ['access_token', 'bearer', 'resource'],
  'resource-return': ['signature', 'aud', 'authorization'],
  'api-browser-return': ['bff', 'channel'],
}

export function termsForStep(stepId: string): GlossaryTerm[] {
  return (stepTerms[stepId] ?? []).flatMap(id => glossary.find(term => term.id === id) ?? [])
}

export const walkthrough = [
  { step: 'resource-request', title: '利用者がログインの必要なデータを見ようとする', route: 'ブラウザ → アプリ', text: '最初に /my-data にアクセスします。アプリがまだログイン状態を確認できないため、本人確認へ進みます。認証後は同じURLにCookie付きでアクセスします。', check: '最初の要求と、ログイン後の要求でURLが同じことを確認しましょう。' },
  { step: 'authorization-request', title: 'アプリが認可リクエストを作る', route: 'App → Browser → Keycloak', text: 'BFFがopenid、state、nonce、PKCEのchallengeなどを付けた移動先を返します。ブラウザが認可エンドポイントへ移動します。', check: 'response_type=codeとscope=openidを探しましょう。' },
  { step: 'user-authentication', title: 'Keycloakがユーザーを認証する', route: 'Browser ↔ Keycloak', text: 'パスワードなどの確認はKeycloakが担当します。すでにKeycloakでログイン済みなら入力画面が省略される場合があります。認証方法自体をOIDCが固定しているわけではありません。', check: 'この部分はBFFでHTTPを実測した記録ではなく、教材の説明です。' },
  { step: 'callback', title: 'ブラウザがコードを持ち帰る', route: 'Keycloak → Browser → App', text: 'このアプリではform_postを使い、codeとstateをBFFのコールバックへPOSTします。この時点のcodeは、APIを呼ぶためのトークンではありません。', check: 'ブラウザ経由で戻るのがid_tokenやaccess_tokenではないことを確認しましょう。' },
  { step: 'token-http', title: 'BFFがコードをトークンに交換する', route: 'App ↔ Keycloak（サーバー間）', text: 'BFFがcodeとcode_verifierを送り、アプリ自身の認証も行います。KeycloakはPKCEなどを確認し、IDトークンとアクセストークンを返します。', check: 'Requestのgrant_typeとcode_verifier、Responseのid_tokenとaccess_tokenを見比べましょう。' },
  { step: 'session', title: 'BFFが認証結果を検証し、セッションを作る', route: 'Appの内部処理 → Browser', text: '署名、発行者、宛先、期限、nonceなどを標準ハンドラーが確認します。BFFは後続検証を終えてCookieのセッションを確立し、アクセストークンをサーバー側に保持します。', check: 'Inspectorの「デコードした項目」と「認証処理の結果」を区別しましょう。項目別の検証結果までは表示していません。' },
  { step: 'api-resource', title: 'アクセストークンで保護APIを呼ぶ', route: 'Browser → App → Resource API', text: 'ブラウザはCookieでBFFへ依頼し、BFFがAuthorization: Bearer … を付けてAPIを呼びます。APIは自分向けのアクセストークンを検証します。', check: 'Browser → AppではCookie、App → Resource APIではBearerを使うことを確認しましょう。' },
] as const

export const misconceptions = [
  { myth: 'OAuth 2.0でトークンを取得できれば、ログインできたことになる', fact: 'OAuth 2.0だけでは、Clientにユーザー認証の結果を伝える共通の方法は定義されません。処理中にユーザーやアプリの認証があっても、それだけでClientのログイン確認にはなりません。OIDCはそのためのIDトークンや検証方法を定めます。', source: 'pitfalls' },
  { myth: 'OIDCでログインできれば、管理者機能も使える', fact: 'ログインした利用者の識別と、業務操作を許すかの判断は別です。ロール、データの所有者、組織などを使う権限判定はアプリ側で設計します。OIDCのscope=openidは「管理者」を意味しません。', source: 'core' },
  { myth: 'IDトークンをAPIに送れば、アクセストークンの代わりになる', fact: '宛先と目的が異なります。IDトークンはClient向けの認証結果です。APIには、そのAPI用のアクセストークンを使います。署名が正しいだけで別用途のトークンを受け入れてはいけません。', source: 'core' },
  { myth: 'JWTは暗号化されているので、中身は秘密になる', fact: '署名されたJWTの内容は通常読めます。署名は改ざんの検知などに使い、暗号化は内容を隠すために使います。デコードできても検証が済んだことにはなりません。', source: 'jwt' },
  { myth: 'アクセストークンは必ずJWTで、中身を読めばログインを判断できる', fact: 'OAuth 2.0はアクセストークンをJWTに限定しません。読めない不透明な文字列の場合もあります。JWTであっても、Clientがその中身だけで自分へのユーザー認証を判断するものではありません。', source: 'oauth' },
  { myth: 'state、nonce、PKCEはどれか一つ覚えれば同じ', fact: '確認する対象が違います。stateは要求とコールバック、nonceは要求とIDトークン、PKCEはコード発行時のchallengeと交換時のverifierを結び付けます。防御できる攻撃には重なりもありますが、無条件に置き換えられるものではありません。', source: 'security' },
  { myth: 'OIDCなら、毎回パスワード画面が出て、ログアウトもすべて連動する', fact: '認証方法や既存のIdPセッションによって画面は変わります。IdPのセッション、アプリのセッション、トークンの有効期限は別々です。複数アプリのログアウト連携には追加の設計が必要です。このデモにはログアウト機能はありません。', source: 'core' },
  { myth: 'ブラウザには絶対にトークンが渡らないのがOIDCの決まり', fact: 'どこがClientとして動くかはアプリ構成によります。このデモはBFFがトークンを保持する構成です。SPAやネイティブアプリを含め、OIDCを使うすべてのアプリが同じ保持方法になるわけではありません。', source: 'core' },
] satisfies { myth: string; fact: string; source: ReferenceId }[]

export const questions = [
  { question: 'このアプリのコールバックで、ブラウザが持ち帰る主な項目は？', options: ['IDトークンとアクセストークン', '認可コードとstate', 'ユーザーのパスワードとclient_secret'], answer: 1, explanation: 'response_type=code、response_mode=form_postなので、codeとstateをフォームで戻します。トークンは後でBFFがサーバー間通信で取得します。', chapter: 'walkthrough' },
  { question: 'Resource APIへ送る資格情報は？', options: ['API向けのアクセストークン', 'BFF向けのIDトークン', 'ブラウザのセッションCookie'], answer: 0, explanation: 'BFFがAPI向けのアクセストークンをBearerとして送ります。ブラウザからBFFへの依頼にはCookieを使います。', chapter: 'tokens' },
  { question: 'JWTのPayloadをデコードしてユーザーIDが読めました。ログイン成功と判断してよい？', options: ['読めたので成功としてよい', '有効期限が未来なら、それだけでよい', '署名、発行者、宛先、期限や要求との対応などの検証が必要'], answer: 2, explanation: 'デコードは内容を読むだけです。信頼する提供元がこのアプリ向けに発行した、今回の要求に対応する有効な認証結果かを確認する必要があります。', chapter: 'tokens' },
  { question: 'OIDCでログインしたユーザーが、他の利用者のデータを編集できるかは誰が判断する？', options: ['OIDCが自動的に判断する', 'アプリやAPIの権限判定で判断する', 'IDトークンがあれば常に編集できる'], answer: 1, explanation: 'OIDCによる認証と業務上の認可は別です。ログイン済みでも、対象データへの編集権限はアプリやAPIで確認します。', chapter: 'basics' },
] satisfies { question: string; options: string[]; answer: number; explanation: string; chapter: ChapterId }[]
