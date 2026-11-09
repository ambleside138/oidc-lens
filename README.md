# OIDC Lens

外部の認証が、アプリのログインになるまで。

OIDC Lensは、開発部のエンジニア向けOIDC勉強会で使う教材アプリです。登場人物の位置を固定したスライド形式で、保護されたデータを見るところから、本人確認、Cookieによるログイン状態の確認、APIを通じたデータ取得までを9場面でたどります。最初は図と短い説明で一周し、2周目は「通信を表示」で実際のやり取りを確かめられます。講師によるKeycloakでの実演にも対応します。

## ローカルデモ

### VS Code のボタンで起動（Windows）

WSL の Ubuntu に Docker Compose と .NET 10 SDK がセットアップ済みなら、Windows 側の VS Code から起動できます。

1. VS Code の「ファイル → フォルダーを開く」（`File → Open Folder`）で、このリポジトリ（例: `C:\Develop\oidc-lens`）を開きます。
2. 左側の「実行とデバッグ」（`Run and Debug` / `Ctrl+Shift+D`）で **OIDC Lens を起動** を選び、上部の **▶** を押します。`F5` でも起動できます。
3. ビルドとサービスの準備が終わると、Edge で [OIDC Lens](https://localhost:7443) が開きます。ログインは `workshop` / `oidc-lens-demo` です。

次回からは **F5** だけで起動します。停止はデバッグツールバーの **■**（`Shift+F5`）です。Edge のデバッグを終了すると、Docker のサービスも停止します。起動途中に中断した場合は、「ターミナル → タスクの実行 → OIDC Lens: 停止」で停止できます。

起動設定は Windows 側でフォルダーを開いて使います。WSL 接続や Dev Container 内で開いている場合は、コマンドパレットの `Remote: Reopen Folder Locally` で戻してください。VS Code 標準の [Edge デバッガー](https://code.visualstudio.com/docs/nodejs/browser-debugging) を使うため、追加のデバッグ拡張は不要です。

初回のビルドには数分かかることがあります。証明書ファイルがなければ自動生成します。HTTPS の証明書が未信頼の場合は、以下の手動手順の `dotnet dev-certs https --trust` を、普段使う Windows アカウントから WSL の Ubuntu 内で一度実行してください。

### ターミナルから起動

WSL の Ubuntu など、Docker Compose と .NET 10 SDK が使えるターミナルで実行します。WSL での証明書の信頼は、普段使う Windows アカウントから行います。

```bash
dotnet dev-certs https --trust
bash infra/create-local-cert.sh
docker compose up --build --wait
```

ブラウザで [OIDC Lens](https://localhost:7443) を開き、「データを見る」から `/my-data` へ進みます。未ログインならKeycloakで本人確認し（`workshop` / `oidc-lens-demo`）、そのあと同じ `/my-data` をCookie付きで開き直します。アプリがアクセストークンでResource APIを呼び、取得したデータを表示します。「このアクセスの流れを見る」で対応する実演の記録を学習画面で確認できます。同じデータをもう一度見ると、ログイン状態を使ってアクセスします。

`/my-data` はブラウザにはデータ表示ページ、JSONを要求するクライアントには取得結果を返します。認証後の戻り先は固定の `/my-data` です。既存の `/auth/login` と手動API呼び出しは引き続き利用できます。KeycloakのデモRealmはローカル用の固定資格情報で動きます。

学習画面と正常系の事前記録は、Keycloakに接続せずに使えます。「通信を表示」は初期状態ではOFFです。幅1200px以上では右側、狭い画面では下側に、項目名と値を分けた通信表を表示します。最終場面の「通信を見ながら、もう一周」でONにして最初へ戻れます。Cookieの一般的な仕組みを示す例は、実際の通信記録とは区別して表示します。

学習画面の下から「通信記録をまとめて調べる」「用語辞典」「参考解説」へ進めます。場面内の言葉や通信表の項目名を押すと、その場で短い説明が開きます。必要なら用語辞典へ進み、元の場面へ戻れます。

`dotnet test` で認証と保護 API の統合テストを、`cd src/web && npm ci && npm test` で画面のステップ構成のテストを実行できます。Compose の起動後に `python3 tests/smoke_login.py` を実行すると、実際の Keycloak で S256 が必須であること、BFF セッションの確立、保護 API の HTTP 200、履歴と通常ログのマスクを確認します。

事前記録を取り直す場合は `python3 tests/smoke_login.py --record src/web/src/recordings/normal.json` を実行し、`docker compose up --build --wait` で画面に反映します。

Keycloak 停止時の配信は、`docker compose stop keycloak` の後に `python3 tests/smoke_login.py --replay-only` で確認できます。ライブ実演を再開するには `docker compose up --wait` を実行します。

## 初回の学習目標

まず学習画面で、本人確認の依頼・引換コードの受領・IDトークンの取得・内容の確認をたどります。「ログインしたあと」は、Cookieの一般的な仕組み、このアプリでのログイン状態の確認、アクセストークンを使ったAPI利用の順に進みます。必要な言葉は、動作を説明してから名前を紹介します。

「用語辞典・参考解説」には、OAuth 2.0との関係、トークンの比較など全6章の参考資料があります。OAuthの背景説明は学習の本編に挟まず、必要な人が参考資料で確認します。場面は `#journey/tokens`、Cookieは `#journey/cookie`、API利用は `#journey/api`、通信は `#flow/session`、解説は `#learn/tokens`、用語は `#learn/glossary/nonce` のようなURLで直接開けます。教材の中心は `src/web/src/LoginJourney.vue` と `src/web/src/journey.ts`、その場の用語説明は `src/web/src/InlineTerm.vue`、参考解説は `src/web/src/LearningGuide.vue` と `src/web/src/learning.ts` にあります。

- OAuth 2.0による認可と、OIDCによるユーザー認証の関係を説明できる。
- Authorization Code Flowをたどり、認可コードがブラウザ経由で戻り、サーバー間でトークンに交換されることを説明できる。
- ID Tokenを誰が検証し、Access Tokenを誰が何のために使うかを説明できる。
- 認証サービスでの認証からアプリのログイン成立までを、各手順が必要な理由とともに説明できる。

画面では、実測したHTTP、認証ライブラリの処理結果、教材の説明を区別します。勉強会ではローカル環境とデモ用ユーザーを使います。

当日の進行、MVPの範囲、初回は着手しない機能は [PLAN.md](PLAN.md) にまとめています。

画面はデジタル庁デザインシステムを基に、本文の文字サイズ、余白、リンク・ボタン、フォーカス表示、レスポンシブ構成を統一しています。採用したルールと公式資料は [DESIGN.md](DESIGN.md) にまとめています。

## 開発環境

[Dev Container](.devcontainer/devcontainer.json) に .NET 10 SDK と Node.js 24（npm を含む）が入ります。

1. Windows では WSL 2 の Ubuntu で Docker Engine を使います。Ubuntu が初回起動の場合は `wsl -d Ubuntu` でユーザーを作成します。Ubuntu で `sudo usermod -aG docker "$USER"` を実行して入り直し、`docker info` が通ることを確認します。
2. VS Code に WSL と Dev Containers の拡張を入れ、Ubuntu の端末でこのリポジトリに移動して `code .` を実行します。
3. コマンドパレットで `Dev Containers: Reopen in Container` を実行します。コンテナの端末で `dotnet --version`、`node --version`、`npm --version` を確認できます。
