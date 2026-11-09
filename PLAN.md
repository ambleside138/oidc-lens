# OIDC Lens 実装計画

## 初回の勉強会（30分）

OIDCや認証・認可という言葉を聞いたことがある開発部のメンバーを対象とする。全体図でログイン成立までを一周し、「誰が、誰に、何を渡し、なぜその手順が必要か」を説明できることを目標にする。Keycloakのライブ実演と通信記録で、学んだ仕組みを確認する。

| 時間 | 内容 |
|---|---|
| 0〜5分 | 利用者・アプリ・認証サービスを紹介し、学習画面の読み方を確認する |
| 5〜17分 | 依頼・利用者の認証・コードの受領・交換・結果の検証を、その必要性とともにたどる |
| 17〜25分 | ライブ実演または事前記録で確かめ、ログイン後のCookieとAccess Tokenの用途を見る |
| 25〜30分 | 図を見ずにログイン成立までを説明し、「コードを受け取った時点で何が足りないか」を確かめる |

ライブ実演に備えて、マスク済みの正常系の記録を1本用意する。Keycloakに接続できない場合も、同じ図とHTTP詳細を使って説明を続けられるようにする。

## 学習画面の構成（2026-11改訂）

- 入口はスライド形式の学習画面。図、短い説明、前後の操作を同じ位置に置き、保護されたデータを見るところからAPIでの取得まで9場面でたどる。実演は `/my-data` を開き、本人確認後に同じURLへ戻る。専門用語は、その動作を説明してから名前を紹介する。
- ログイン成立後に、Cookieの一般的な仕組み、このアプリでのログイン状態の確認、API利用を順に説明する。APIの場面では、IDトークンを受け取った場面を振り返り、アクセストークンも受け取っていたことを示す。
- 通信は初期OFF。2周目はONで読み進められ、途中でも切り替えられる。幅に余裕があるときは右側に表示する。
- 用語はその場で説明を開く。「通信記録を調べる」と「用語辞典・参考解説」は補助資料とし、学習と同列のタブにはしない。OAuthの経緯を本編に挟まない。
- 学習の進行からライブ試行の成功を推定しない。未観測の場面は未観測として扱う。
- デザインはデジタル庁デザインシステムを基にする。具体的な文字・色・余白・操作・アクセシビリティの選択は [DESIGN.md](DESIGN.md) を参照。

## 初回向けMVPの範囲

- Keycloakで実際にログインする。Authorization Code Flow + PKCE S256を使う。
- ログイン開始から保護APIの呼び出しまでをシーケンス図でたどり、主要な通信のHTTP詳細を表示する。
- ID Token Inspectorでマスク済みのHeader / Payloadと、アプリが検証を終えてセッションを確立した結果を分けて表示する。
- ライブ試行の履歴と、事前に採取した正常系の記録を同じ画面でたどれるようにする。

## 構成

Vue 3 + TypeScriptをASP.NET Core BFFと同一オリジンで配信する。BFFとResource APIは.NET 10を使う。BFFは標準OIDCハンドラーとCookie認証を使用し、KeycloakにはConfidential Clientとして接続する。セッションCookieにはトークンを格納せず、Resource APIの呼び出しに使うAccess Tokenはサーバー側に保持する。Resource APIは教材用の保護された1エンドポイントを持ち、署名・Issuer・Audience・有効期限を検証する。

初回デモではブラウザ経由の認可リクエストでパラメーターを観察するため、BFFで `PushedAuthorizationBehavior.Disable` を指定し、KeycloakのデモクライアントではPushed Authorization Requests（PAR）を必須にしない。

Docker ComposeでBFF、Keycloak、Resource APIを起動する。KeycloakのIssuer URLを固定し、ブラウザとBFFコンテナの両方から解決できるようにする。初回の疎通でローカルHTTPS、証明書の信頼、リダイレクトURIの完全一致、Keycloak側のS256必須設定を確認する。

```text
compose.yaml
infra/keycloak/realm-demo.json
src/OidcLens.Bff/             # Auth、Tracing、Demo
src/OidcLens.ResourceApi/
src/web/                      # flow、inspector、curriculum
tests/OidcLens.IntegrationTests/
```

## 観測と表示

画面では記録の出所を「HTTP実測」「認証処理」「教材」で示す。HTTP詳細は観測地点、送信元・送信先、Method、マスク済みURL、Status、許可したRequest / Response項目を表示する。

| ステップ | 記録する事実と観測地点 |
|---|---|
| Resource Request | 未ログインでの `GET /my-data` と、Cookieの有無を記録する。本人確認後に同じURLを開き直すところまで一続きで扱う |
| Authorization Request | アプリが返すリダイレクト応答とマスク済み `Location` を観測する。ブラウザからKeycloakへのアクセスは教材表示にする |
| User Authentication | Keycloakのログイン画面と内部処理は教材表示にする。既存のSSOセッションによってフォームが省略される場合を説明する |
| Authorization Code Response | BFFのコールバックでMethodと `code`、`state`、`error` の有無を観測する。戻り先 `/my-data` とセッションCookieの発行も、値を隠して記録する。Keycloakがブラウザへ返す応答は別の出来事として扱う |
| Token Request / Response | OIDCバックチャネルの `DelegatingHandler` でトークンエンドポイントのPOSTと応答を観測する。認証イベントからはコード交換に進んだ地点を記録する |
| ID Token Validation | Appレーン内の認証処理として表示する。標準ハンドラーの後続検証とセッション確立まで確認して、試行の成功を確定する |
| API Access | Browser → BFFのCookie認証とBFF → Resource APIのAccess Tokenによる呼び出しをそれぞれ観測する |

観測処理はHTTP本文の読み取りや例外によって認証処理を変えないようにする。値は保存・配信前に許可リストで抽出する。トークン、Cookie、Authorizationヘッダー、認可コード、`state`、`nonce`、`code_verifier`、クライアントシークレット、個人情報は値を記録しない。URL、`Location`、例外、通常ログも確認対象にする。

### 試行の関連付けと履歴

1. ログイン開始時に `attemptId` を発行し、ブラウザのデモセッションと関連付ける。標準ハンドラーが `state` に保護する `AuthenticationProperties` を使い、コールバックで復元する。
2. 現在の処理との関連を確認できた通信だけを試行に紐づける。
3. BFFに短寿命・件数上限付きの履歴を持つ。Keycloakから画面へ戻ったら履歴を読み込み、API呼び出し後に更新する。試行IDごとに履歴を分け、取得時はデモセッションとの所有関係を確認する。

### 3ペインとToken Inspector

- 左はステップの一覧。前へ・次へで通信をたどり、現在の試行と事前に採取した正常系の記録をラベルで区別する。
- 中央はBrowser / App / IdPのシーケンス図。Vue + SVGで通信を選択可能にし、フロントチャネルとバックチャネルを線種とラベルで区別する。API AccessではResource APIを展開する。
- 右は選んだ通信のHTTP詳細とToken Inspector。教材データは観測履歴と分けて管理する。
- Token Inspectorはデコード結果と認証処理の結果を別欄にする。ID Tokenの署名検証にはDiscovery由来の信頼済み鍵と標準ライブラリを使い、`nonce` などの後続検証とセッション確立まで確認して成功を表示する。

## 実装順序と完了条件

| 段階 | 作業 | 確認できる状態 |
|---|---|---|
| 1 | Compose、Realm、BFFのOIDC・Cookie認証 | テストユーザーがS256でログインし、コールバック後にセッションが確立する |
| 2 | HTTP観測、試行の関連付け、履歴 | コールバック後に試行の履歴を取得できる。複数タブの試行が混ざらず、保存・配信・通常ログに秘密値が出ない |
| 3 | 3ペイン、記録の再生 | 正常系をたどれ、ブラウザ経由とサーバー間の通信、実測と教材表示を見分けられる |
| 4 | Token Inspector、Resource API | ID Tokenのデコードと検証結果を区別できる。BFFがAccess Tokenで保護されたAPIを呼び、APIが不正なトークンを拒否する |
| 5 | 正常系の事前記録と通し練習 | Keycloakへの接続なしで正常系の記録を開ける。実演と最後の確認問題までを30分の配分で進められる |

## 初回は着手しない機能

- Discovery / JWKS取得の観測と画面表示。BFFで取得を記録し、試行との関連が確定しない取得は共有履歴に置く案を保留する。
- ID Token検証の項目別表示（署名、`iss`、`aud`、`exp`、`nonce`）。根拠を取得できない項目は「判定未取得」と表示する案を保留する。
- SSEによるライブ追従、HTTPの所要時間表示、規格と図の相互参照。
- 異常系の教材デモと、失敗地点・未実行ステップの表示。`state` 不一致はコールバックで停止するシミュレーション、PKCEは誤った `code_verifier` による `invalid_grant` の実測を候補とする。`nonce` と `aud` の失敗デモも後続の候補とする。
- 複数IdP、Refresh Token、ログアウト、Playwrightなどを使ったブラウザとKeycloak間のHTTP実測。

## 設計レビューで確認したい点

- .NET 10の標準ハンドラーで、ID Tokenの署名を必須にする接続点、鍵更新、後続検証とセッション確立の確認方法、ログイン失敗時の扱いを評価する。

## 参照仕様と実装資料

- [OAuth 2.0 Authorization Code Grant](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.1) · [Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750.html#section-2.1) · [OAuth 2.0 Security BCP](https://www.rfc-editor.org/rfc/rfc9700.html)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html#CodeFlowAuth) · [OpenID Connect Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html) · [PKCE](https://www.rfc-editor.org/rfc/rfc7636.html#section-4) · [JWT](https://www.rfc-editor.org/rfc/rfc7519.html)
- [ブラウザベースアプリのBFF構成](https://www.rfc-editor.org/rfc/rfc10017.html#section-6.1) · [ASP.NET Core 10のOIDCハンドラー](https://raw.githubusercontent.com/dotnet/aspnetcore/v10.0.0/src/Security/Authentication/OpenIdConnect/src/OpenIdConnectHandler.cs) · [ASP.NET Core 10のPAR設定](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.authentication.openidconnect.pushedauthorizationbehavior?view=aspnetcore-10.0) · [KeycloakのHostname設定](https://www.keycloak.org/server/hostname)
