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

ブラウザで [OIDC Lens](https://localhost:7443) を開き、`workshop` / `oidc-lens-demo` でログインします。Keycloak のデモ Realm はローカル用の固定資格情報で動きます。

`dotnet test` で認証の統合テストを実行できます。Compose の起動後に `python3 tests/smoke_login.py` を実行すると、実際の Keycloak が S256 を要求し、コールバック後に BFF セッションが成立するところまで検証します。

## 初回の学習目標

- OAuth 2.0による認可と、OIDCによるユーザー認証の関係を説明できる。
- Authorization Code Flowをたどり、認可コードがブラウザ経由で戻り、サーバー間でトークンに交換されることを説明できる。
- ID Tokenを誰が検証し、Access Tokenを誰が何のために使うかを説明できる。

画面では、実測したHTTP、認証ライブラリの処理結果、教材の説明を区別します。勉強会ではローカル環境とデモ用ユーザーを使います。

当日の進行、MVPの範囲、初回は着手しない機能は [PLAN.md](PLAN.md) にまとめています。現在は設計段階です。
