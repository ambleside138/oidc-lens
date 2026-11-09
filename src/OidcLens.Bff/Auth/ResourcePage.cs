using System.Net;

namespace OidcLens.Bff.Auth;

internal static class ResourcePage
{
    public static string Render(string data, string? attemptId)
    {
        var href = attemptId is null ? "/" : $"/?attempt={Uri.EscapeDataString(attemptId)}#journey/start";
        var linkLabel = attemptId is null ? "学習画面へ戻る" : "このアクセスの流れを見る →";
        return $$"""
            <!doctype html>
            <html lang="ja">
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>取得したデータ · OIDC Lens</title>
            <style>
            body{font:16px/1.8 "Yu Gothic",Meiryo,sans-serif;color:#1a1a1a;background:#fff;margin:0}
            header{padding:20px 32px;border-bottom:1px solid #ddd}header a{color:inherit;text-decoration:none}
            main{max-width:760px;padding:40px 24px;margin:auto}h1{font-size:28px;line-height:1.5}
            pre{padding:24px;background:#f5f5f5;white-space:pre-wrap;overflow-wrap:anywhere}
            a{color:#0031d8;text-underline-offset:.2em}nav{display:flex;flex-wrap:wrap;gap:20px;margin-top:32px}
            :focus-visible{outline:3px solid #0031d8;outline-offset:4px}
            </style></head>
            <body><header><a href="/">OIDC Lens</a></header><main>
            <p>/my-data</p><h1>データを取得できました</h1>
            <p>アプリがログイン状態を確認し、別のサービスから受け取ったデータです。</p>
            <pre>{{WebUtility.HtmlEncode(data)}}</pre>
            <nav><a href="{{WebUtility.HtmlEncode(href)}}">{{linkLabel}}</a><a href="/my-data">同じデータをもう一度見る →</a></nav>
            </main></body></html>
            """;
    }
}
