# OIDC Lens

ログインの裏側を覗いてみよう。

OIDC Lensは、開発部のエンジニア向けOIDC勉強会で使う教材アプリです。初回の30分では講師がKeycloakでログインし、参加者はログインから保護APIの呼び出しまで、ブラウザ、アプリ、IdPの間で何が起きるかをシーケンス図とHTTP詳細でたどります。

## ローカルデモ

WSL の Ubuntu など、Docker Compose と .NET 10 SDK が使えるターミナルで実行します。WSL での証明書の信頼は、普段使う Windows アカウントから行います。

```bash
dotnet dev-certs https --trust
bash infra/create-local-cert.sh
docker compose up --build --wait
```

ブラウザで [OIDC Lens](https://localhost:7443) を開き、`workshop` / `oidc-lens-demo` でログインします。ライブ試行に切り替わったら、「保護 API を呼ぶ」で Resource API の応答まで表示できます。Keycloak のデモ Realm はローカル用の固定資格情報で動きます。

画面の「正常系の事前記録」は Keycloak に接続せずに再生できます。勉強会では「アプリへのコールバック」でブラウザが運ぶ項目を確認し、「ID Token を検証しセッションを確立」でデコード結果と認証処理を見比べます。最後に、どの通信で Access Token を使ったかを確認します。

`dotnet test` で認証と保護 API の統合テストを、`cd src/web && npm ci && npm test` で画面のステップ構成のテストを実行できます。Compose の起動後に `python3 tests/smoke_login.py` を実行すると、実際の Keycloak で S256 が必須であること、BFF セッションの確立、保護 API の HTTP 200、履歴と通常ログのマスクを確認します。

事前記録を取り直す場合は `python3 tests/smoke_login.py --record src/web/src/recordings/normal.json` を実行し、`docker compose up --build --wait` で画面に反映します。

Keycloak 停止時の配信は、`docker compose stop keycloak` の後に `python3 tests/smoke_login.py --replay-only` で確認できます。ライブ実演を再開するには `docker compose up --wait` を実行します。

## 初回の学習目標

- OAuth 2.0による認可と、OIDCによるユーザー認証の関係を説明できる。
- Authorization Code Flowをたどり、認可コードがブラウザ経由で戻り、サーバー間でトークンに交換されることを説明できる。
- ID Tokenを誰が検証し、Access Tokenを誰が何のために使うかを説明できる。

画面では、実測したHTTP、認証ライブラリの処理結果、教材の説明を区別します。勉強会ではローカル環境とデモ用ユーザーを使います。

当日の進行、MVPの範囲、初回は着手しない機能は [PLAN.md](PLAN.md) にまとめています。
