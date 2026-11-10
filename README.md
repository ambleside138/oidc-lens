# OIDC Lens

2つの記事を読んだあと、記事の概念を具体的な通信と処理に結び付ける補助教材です。画面はデジタル庁デザインシステムを基にしています。

- [一番分かりやすい OAuth の説明](https://qiita.com/TakahikoKawasaki/items/e37caf50776e00e733be)
- [一番分かりやすい OpenID Connect の説明](https://qiita.com/TakahikoKawasaki/items/498ca08bbfcc341691fe)

入口から通信ログを表示します。写真APIの401から、認可要求、本人確認と許可、認可コード、トークン交換、検証、API利用、ブラウザへの200応答までを12場面で追います。OIDC専用です。固定ヘッダーに表示中の場面番号とタイトルを残し、各場面のシーケンス図で前後の通信とのつながりを確認できます。各場面に記事の説明手順の番号、HTTPの主要項目、内部処理、読みどころを置いています。最後の3問から根拠のログに戻れます。

## Keycloakで実際に試す

WSL UbuntuのDocker環境で以下を実行し、[実験画面](https://localhost:7443/#/lab/prepare)を開きます。通常の教材画面の「Keycloakで実際に試す」からも移動できます。

```bash
bash infra/start-local-demo.sh
```

1. 「実験を準備する」で実際のDiscoveryを取得し、state・nonce・PKCEを生成。
2. 「Keycloakで認証する」で本人確認と許可。デモユーザーは `workshop` / `oidc-lens-demo`。
3. コードを受領したところで待機。「コードをトークンに交換する」を押すまで交換しない。
4. 公開鍵取得とIDトークンの検証、Cookieによるログイン成立、保護API呼び出しをそれぞれ実行。

コード交換では「正しいverifier」と「別のverifier」を選べます。別の値ではKeycloakのPKCE拒否を確認でき、次の試行で前回の応答と比較できます。同じ認可コードでは再送しません。認可コードは短命なので、期限切れ時も新しい試行からやり直します。新しい試行では前のアプリのログインを終了します。

実演用client `oidc-lens-lab` はpublic clientでS256が必須です。従来のconfidential clientは残しています。実演のログはサーバーの15分の一時記録で、機密値は同じ値を追えるラベルに置換します。Keycloak画面内の通信全体とAPI内部の検査は未観測です。表示するHTTPは主要項目を抜粋・整形しており、未実行の処理を実測ログとして生成しません。実測の図は実際のホスト名を使います。

実装は `src/OidcLens.Bff/Lab/`、`src/web/src/LiveLab.vue`、`src/web/src/live.ts`。普通の疑似ログの教材とは `AppShell.vue` で切り替えます。Node/Viteだけで起動した環境では実演バックエンドに接続できない旨を表示します。

```bash
dotnet test
python3 tests/smoke_lab.py
python3 tests/smoke_login.py
```

`smoke_lab.py` は本物のKeycloakで正常系とPKCE不一致を試し、待機境界、再実行拒否、実APIの200、ログのマスクを確認します。ブラウザの認証画面の入力を自動操作するテストではありません。

## 疑似ログの教材を単独で起動する

Node.js 24以上を使います。Keycloak、Docker、.NETは教材画面の起動には不要です。

```powershell
cd src/web
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

[教材を開く](http://127.0.0.1:5173/)。OIDCの最初の場面を初期表示します。例：`#/oidc/token`、`#/oidc/validate`、`#/oidc/api`で場面を直接開けます。ブラウザの戻る・進むにも対応します。

```powershell
npm test
npm run build
```

現在の実装は `src/web/src/ReplayApp.vue`、データは `replay.ts`、シーケンス図は `SequenceDiagram.vue` と `sequence.ts`、見た目は `replay.css` です。`main.ts`はこの新しい教材だけを読み込みます。旧画面と解説データは既存の作業内容を保護するためファイルを残していますが、新教材からは読み込みません。

## 疑似ログの前提

実測ログではなく、架空のサーバー側Webアプリを描く一貫した疑似ログです。ログの再生に認証・外部API通信・暗号計算は伴いません。トークン、鍵、照合値は教材用の識別子または省略表記です。

記事が扱う概念をAuthorization Code Flow + PKCEの具体例に展開しています。クライアント認証、Cookieセッション、明示的な許可画面、不透明なアクセストークン、introspection、photos.readという権限名はこの例で選んだ構成です。OAuth/OIDCのすべての実装で同じ構成が必須という意味ではありません。JWKSの取得はキャッシュがない場合を描いています。

このOIDCの例ではopenidとnonceを要求し、署名付きIDトークンの検証後にログインを成立させます。写真APIへ送るのはアクセストークンです。OAuth専用モードと比較操作は廃止しました。旧`#/oauth/...`のブックマークは同じ場面のOIDC表示に移行します。

## 既存の実演環境

以前のKeycloak / BFF / Resource APIは保持していますが、疑似ログ教材とは別の実装です。段階実行は実演用クライアントを追加して同じKeycloakとResource APIに接続します。新教材の同意画面・権限検査・introspectionを、既存実演が実行するわけではありません。

WSL UbuntuでDocker Composeと.NET 10 SDKが使える場合は、従来のVS Codeの実行構成、または以下の起動方法を利用できます。

```bash
dotnet dev-certs https --trust
bash infra/create-local-cert.sh
bash infra/start-local-demo.sh --dev
```

従来の実演の入口は `https://localhost:7443/my-data`、デモ資格情報は `workshop` / `oidc-lens-demo` です。停止は `docker compose -f compose.yaml -f compose.dev.yaml stop`。`.vscode`、Compose、実演バックエンドの既存作業は今回変更していません。バックエンドの検証は `dotnet test` と、環境起動後の `python3 tests/smoke_login.py` です。

評価の根拠と確認範囲は [EVALUATION.md](EVALUATION.md)、要求と設計は [PLAN.md](PLAN.md)、デザインは [DESIGN.md](DESIGN.md) に記載しています。
