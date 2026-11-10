using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using OidcLens.Bff.Auth;
using OidcLens.Bff.Tracing;

namespace OidcLens.Bff.Lab;

// A deliberately staged, local teaching client. The ordinary OIDC handler remains unchanged.
internal sealed class LabEndpoints(IConfiguration config, LabStore store, IHttpClientFactory clients, TimeProvider clock)
{
    public const string ClientName = "lab-provider";
    private string Issuer => config["Oidc:Authority"]?.TrimEnd('/') ?? "";
    private string ClientId => config["Lab:ClientId"] ?? "oidc-lens-lab";
    private string RedirectUri => config["Lab:RedirectUri"] ?? "https://localhost:7443/auth/lab/callback";
    private bool Enabled => config.GetValue<bool>("Lab:Enabled") && Uri.TryCreate(Issuer, UriKind.Absolute, out var issuer)
        && issuer.Scheme == "https" && Uri.TryCreate(RedirectUri, UriKind.Absolute, out var callback) && callback.Scheme == "https"
        && Uri.TryCreate(config["ResourceApi:BaseAddress"], UriKind.Absolute, out var resource) && resource.Scheme == "https";
    private static string? Owner(HttpContext http) => http.Request.Cookies[TraceCapture.OwnerCookie];
    private static bool IsCommand(HttpContext http) => http.Request.Headers["X-Oidc-Lens"] == "workshop";
    private void Log(LabAttempt a, string step, string from, string to, string kind, string label, string wire) =>
        a.Add(clock, step, from, to, kind, label, wire);
    private static string Json(object value) => JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = true });
    private static string A(string kind, string? value) => LabAttempt.Alias(kind, value);
    private static string RequestWire(string method, string url, string? headers = null, string? body = null)
    {
        var uri = new Uri(url);
        return $"{method} {uri.PathAndQuery} HTTP/1.1\nHost: {uri.Authority}" +
            (headers is null ? "" : "\n" + headers) + (body is null ? "" : "\n\n" + body);
    }
    private static string ResponseWire(HttpResponseMessage response, object? safeBody) =>
        $"HTTP/{response.Version} {(int)response.StatusCode} {response.ReasonPhrase}" +
        (response.Content.Headers.ContentType is { } type ? "\nContent-Type: " + type : "") +
        (response.Headers.WwwAuthenticate.Count > 0 ? "\nWWW-Authenticate: " + string.Join(", ", response.Headers.WwwAuthenticate.Select(value => value.Scheme)) : "") +
        (safeBody is null ? "\n\n（本文は未取得）" : "\n\n" + Json(safeBody));
    private string Endpoint(JsonElement metadata, string key)
    {
        var value = metadata.GetProperty(key).GetString()!;
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https" ||
            uri.GetLeftPart(UriPartial.Authority) != new Uri(Issuer).GetLeftPart(UriPartial.Authority))
            throw new InvalidOperationException("Unexpected provider endpoint.");
        return value;
    }

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/lab", (HttpContext h, LabEndpoints lab) => lab.Status(h));
        app.MapPost("/api/lab", (HttpContext h, LabEndpoints lab) => lab.Prepare(h));
        app.MapGet("/auth/lab/start", (string id, HttpContext h, LabEndpoints lab) => lab.StartAuthorization(id, h));
        app.MapGet("/auth/lab/callback", (HttpContext h, LabEndpoints lab) => lab.Callback(h));
        app.MapPost("/api/lab/{id}/token", (string id, ExchangeInput input, HttpContext h, LabEndpoints lab) =>
            lab.Command(id, "code-received", h, a => lab.Exchange(a, input, h)));
        app.MapPost("/api/lab/{id}/validate", (string id, HttpContext h, LabEndpoints lab) =>
            lab.Command(id, "tokens-received", h, a => lab.Validate(a, h)));
        app.MapPost("/api/lab/{id}/session", (string id, HttpContext h, LabEndpoints lab) =>
            lab.Command(id, "validated", h, a => lab.Session(a, h)));
        app.MapPost("/api/lab/{id}/resource", (string id, HttpContext h, LabEndpoints lab) =>
            lab.Command(id, "session-established", h, a => lab.Resource(a, h)));
    }
    private async Task<IResult> Status(HttpContext http)
    {
        var a = store.Find(Owner(http));
        if (a is null) return Results.Ok(new LabStatus(Enabled, null));
        await a.Gate.WaitAsync(http.RequestAborted);
        try { return Results.Ok(new LabStatus(Enabled, a.Snapshot())); }
        finally { a.Gate.Release(); }
    }
    private async Task<IResult> Prepare(HttpContext http)
    {
        if (!Enabled) return Results.StatusCode(503);
        if (!IsCommand(http)) return Results.BadRequest();
        var a = store.Start(TraceCapture.GetOrCreateOwner(http));
        a.Hosts = new Dictionary<string, string> { ["client"] = new Uri(RedirectUri).Authority, ["provider"] = new Uri(Issuer).Authority, ["resource"] = new Uri(config["ResourceApi:BaseAddress"]!).Authority };
        await a.Gate.WaitAsync(http.RequestAborted);
        try
        {
            BrowserCommand(a, "prepare", http);
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            Log(a, "prepare", "client", "client", "internal", "新しい試行のため、前のアプリのログイン状態を終了", "Cookie認証のSignOutを実行\n今回の試行では、検証とログイン操作を終えるまで認証セッションを作成しない");
            var url = Issuer + "/.well-known/openid-configuration";
            Log(a, "prepare", "client", "provider", "request", "信頼する発行者の設定を取得", RequestWire("GET", url));
            using var response = await clients.CreateClient(ClientName).GetAsync(url, http.RequestAborted);
            if (!response.IsSuccessStatusCode) Log(a, "prepare", "provider", "client", "response", "設定取得への拒否応答（本文は未取得）", ResponseWire(response, null));
            response.EnsureSuccessStatusCode();
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(http.RequestAborted), cancellationToken: http.RequestAborted);
            var metadata = document.RootElement;
            if (metadata.GetProperty("issuer").GetString() != Issuer) throw new InvalidOperationException("Issuer mismatch.");
            a.AuthorizationEndpoint = Endpoint(metadata, "authorization_endpoint");
            a.TokenEndpoint = Endpoint(metadata, "token_endpoint");
            a.JwksUri = Endpoint(metadata, "jwks_uri");
            Log(a, "prepare", "provider", "client", "response", "認可・トークン・公開鍵の取得先を受領", ResponseWire(response,
                new { issuer = Issuer, authorization_endpoint = a.AuthorizationEndpoint, token_endpoint = a.TokenEndpoint, jwks_uri = a.JwksUri }));
            Log(a, "prepare", "client", "client", "internal", "state・nonce・PKCEを実際に生成してサーバーに保存",
                $"state = {A("state", a.State)}\nnonce = {A("nonce", a.Nonce)}\ncode_verifier = {A("verifier", a.Verifier)}\ncode_challenge = {A("challenge", a.Challenge)}\n生成方法: BASE64URL(SHA256(ASCII(code_verifier)))\n保存場所: サーバーの一時領域（15分）");
            a.Phase = "prepared";
            a.NextRequest = AuthorizationDisplay(a);
            return Results.Ok(a.Snapshot());
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or InvalidOperationException or TaskCanceledException or KeyNotFoundException or FormatException)
        {
            a.Fail("Keycloakの設定を取得できませんでした。実演環境の起動を確認して、やり直してください。");
            return Results.Json(a.Snapshot(), statusCode: 502);
        }
        finally { a.Gate.Release(); }
    }
    private string AuthorizationDisplay(LabAttempt a) => RequestWire("GET", a.AuthorizationEndpoint!, body: null) +
        $"\n\nQuery:\nresponse_type=code\nclient_id={ClientId}\nredirect_uri={RedirectUri}\nscope=openid\nstate={A("state", a.State)}\nnonce={A("nonce", a.Nonce)}\ncode_challenge={A("challenge", a.Challenge)}\ncode_challenge_method=S256\nresponse_mode=query";
    private async Task<IResult> StartAuthorization(string id, HttpContext http)
    {
        if (!Enabled) return Results.StatusCode(503);
        if (store.Find(Owner(http), id) is not { } a) return Results.Redirect("/#/lab/prepare");
        await a.Gate.WaitAsync(http.RequestAborted);
        try
        {
            if (a.Phase != "prepared") return Results.Conflict();
            var url = QueryHelpers.AddQueryString(a.AuthorizationEndpoint!, new Dictionary<string, string?>
            {
                ["client_id"] = ClientId, ["redirect_uri"] = RedirectUri, ["response_type"] = "code", ["scope"] = "openid",
                ["response_mode"] = "query", ["state"] = a.State, ["nonce"] = a.Nonce,
                ["code_challenge"] = a.Challenge, ["code_challenge_method"] = "S256"
            });
            Log(a, "authorize", "browser", "client", "request", "実行ボタンから認証を開始", "GET /auth/lab/start?id=" + a.Id + " HTTP/1.1\nHost: localhost:7443");
            Log(a, "authorize", "client", "browser", "response", "ブラウザをKeycloakへ移動させる302応答",
                "HTTP/1.1 302 Found\nLocation: " + a.AuthorizationEndpoint + "?（以下のQueryを付加）\n\n" + AuthorizationDisplay(a).Split("Query:\n")[1]);
            a.Phase = "authorizing";
            a.NextRequest = null;
            return Results.Redirect(url);
        }
        finally { a.Gate.Release(); }
    }
    private async Task<IResult> Callback(HttpContext http)
    {
        http.Response.Headers.CacheControl = "no-store";
        http.Response.Headers["Referrer-Policy"] = "no-referrer";
        if (!Enabled || store.Find(Owner(http)) is not { } a) return Results.BadRequest();
        await a.Gate.WaitAsync(http.RequestAborted);
        try
        {
            var query = http.Request.Query;
            if (a.Phase != "authorizing" || query["state"].Count != 1 || !Equal(query["state"].ToString(), a.State)) return Results.BadRequest();
            if (query.TryGetValue("iss", out var returnedIssuer) && (returnedIssuer.Count != 1 || returnedIssuer != Issuer)) return Results.BadRequest();
            var code = query["code"].ToString();
            if (query["code"].Count != 1 || code.Length is 0 or > 8192 || query.ContainsKey("error"))
            {
                a.Fail("認証または許可が完了しませんでした。新しい試行からやり直してください。");
                return Results.Redirect("/#/lab/callback");
            }
            a.Code = code;
            Log(a, "callback", "browser", "client", "request", "Keycloakからコードがブラウザ経由で戻った",
                $"GET /auth/lab/callback?code={A("code", code)}&state={A("state", a.State)} HTTP/1.1\nHost: localhost:7443\nCookie: ブラウザの試行識別Cookieあり");
            Log(a, "callback", "client", "client", "internal", "stateを照合。ここで実際の処理を待機",
                $"保存したstate = {A("state", a.State)}\n受領したstate = {A("state", query["state"])}\nstate照合: PASS\nトークン交換: 未実行\nIDトークン検証: 未実行\n今回のログイン: 未成立\nKeycloak内の本人確認画面の通信はこのアプリから未観測");
            Log(a, "callback", "client", "browser", "response", "コードをURLから除いて実験画面へ戻す", "HTTP/1.1 302 Found\nLocation: /#/lab/callback\nReferrer-Policy: no-referrer\n（ログイン用Set-Cookieなし）");
            a.Phase = "code-received";
            a.NextRequest = TokenDisplay(a, a.Verifier);
            return Results.Redirect("/#/lab/callback");
        }
        finally { a.Gate.Release(); }
    }
    private async Task<IResult> Command(string id, string phase, HttpContext http, Func<LabAttempt, Task> execute)
    {
        if (!Enabled) return Results.StatusCode(503);
        if (!IsCommand(http)) return Results.BadRequest();
        if (store.Find(Owner(http), id) is not { } a) return Results.NotFound();
        await a.Gate.WaitAsync(http.RequestAborted);
        try
        {
            if (a.Phase != phase) return Results.Conflict();
            await execute(a);
            return Results.Ok(a.Snapshot());
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or InvalidOperationException or TaskCanceledException or SecurityTokenException or KeyNotFoundException or FormatException)
        {
            a.Fail("通信または検証に失敗しました。記録を確認し、新しい試行からやり直してください。");
            return Results.Json(a.Snapshot(), statusCode: 502);
        }
        finally { a.Gate.Release(); }
    }
    private void BrowserCommand(LabAttempt a, string step, HttpContext http) =>
        Log(a, step, "browser", "client", "request", "この操作でクライアントに実行を依頼",
            $"POST {http.Request.Path} HTTP/1.1\nHost: localhost:7443\nX-Oidc-Lens: workshop\nCookie: {(http.Request.Cookies.ContainsKey(TraceCapture.SessionCookie) ? "ログイン用Cookieあり" : "ログイン用Cookieなし")}");
    private string TokenDisplay(LabAttempt a, string verifier) => RequestWire("POST", a.TokenEndpoint!, "Content-Type: application/x-www-form-urlencoded",
        $"grant_type=authorization_code&client_id={ClientId}&redirect_uri={RedirectUri}&code={A("code", a.Code)}&code_verifier={A("verifier", verifier)}");
    private async Task Exchange(LabAttempt a, ExchangeInput input, HttpContext http)
    {
        if (input.Pkce is not ("correct" or "wrong")) throw new InvalidOperationException("Unknown PKCE selection.");
        BrowserCommand(a, "token", http);
        var verifier = input.Pkce == "correct" ? a.Verifier : LabAttempt.RandomValue();
        Log(a, "token", "client", "client", "internal", "今回送信するverifierの選択",
            $"保存したverifier = {A("verifier", a.Verifier)}\n送信するverifier = {A("verifier", verifier)}\n条件: {(input.Pkce == "correct" ? "保存値を使用" : "意図的に別の値を使用")}\nclient_secret: 使用しない（実験用public client）");
        Log(a, "token", "client", "provider", "request", "このボタンで初めてトークン要求を送信", TokenDisplay(a, verifier));
        using var response = await clients.CreateClient(ClientName).PostAsync(a.TokenEndpoint, new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = ClientId, ["redirect_uri"] = RedirectUri, ["grant_type"] = "authorization_code",
            ["code"] = a.Code!, ["code_verifier"] = verifier
        }), http.RequestAborted);
        a.Code = null; // An exchange attempt is never retried with the same code.
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(http.RequestAborted), cancellationToken: http.RequestAborted);
        var token = document.RootElement;
        if (!response.IsSuccessStatusCode)
        {
            var error = token.TryGetProperty("error", out var field) && field.GetString() is "invalid_grant" or "invalid_request" or "invalid_client" ? field.GetString() : "provider_error";
            Log(a, "token", "provider", "client", "response", "Keycloakが実際に返した拒否応答", ResponseWire(response, new { error }));
            var description = token.TryGetProperty("error_description", out var detail) && detail.ValueKind == JsonValueKind.String ? detail.GetString() ?? "" : "";
            var pkceRejected = description.Contains("PKCE", StringComparison.OrdinalIgnoreCase) || description.Contains("code verifier", StringComparison.OrdinalIgnoreCase);
            Log(a, "token", "client", "client", "internal", "受信したエラー説明から種別を判定（生の説明文は表示しない）",
                pkceRejected ? "エラー種別: PKCE検証の失敗\n認可要求時のchallengeに対応するverifierを提示できなかった。\n同じ認可コードで再送せず、新しい試行で比較する。" : "エラー種別: 認可コード等の検査で拒否\n期限切れ・再利用・要求条件などを確認し、新しい試行でやり直す。");
            a.Fail(pkceRejected ? "KeycloakからPKCE検証の失敗が返されました。新しい試行で正しいverifierと比較してください。" : "コード交換が拒否されました。コードの期限切れなどを確認し、新しい試行でやり直してください。");
            return;
        }
        a.AccessToken = token.GetProperty("access_token").GetString();
        a.IdToken = token.GetProperty("id_token").GetString();
        if (token.GetProperty("token_type").GetString() != "Bearer" || string.IsNullOrEmpty(a.AccessToken) || string.IsNullOrEmpty(a.IdToken)) throw new InvalidOperationException("Incomplete token response.");
        Log(a, "token", "provider", "client", "response", "トークンを受領。IDトークンの検証はまだ行わない", ResponseWire(response,
            new { access_token = A("access-token", a.AccessToken), id_token = A("id-token", a.IdToken), token_type = "Bearer", expires_in = token.TryGetProperty("expires_in", out var ttl) ? ttl.GetInt32() : (int?)null }));
        a.Phase = "tokens-received";
        a.NextRequest = RequestWire("GET", a.JwksUri!);
    }
    private async Task Validate(LabAttempt a, HttpContext http)
    {
        BrowserCommand(a, "validate", http);
        Log(a, "validate", "client", "provider", "request", "署名検証のため実際に公開鍵を取得", RequestWire("GET", a.JwksUri!));
        using var response = await clients.CreateClient(ClientName).GetAsync(a.JwksUri, http.RequestAborted);
        if (!response.IsSuccessStatusCode) Log(a, "validate", "provider", "client", "response", "公開鍵取得への拒否応答（本文は未取得）", ResponseWire(response, null));
        response.EnsureSuccessStatusCode();
        var keySet = new JsonWebKeySet(await response.Content.ReadAsStringAsync(http.RequestAborted));
        Log(a, "validate", "provider", "client", "response", "Keycloakの公開鍵セットを受領（長い公開鍵値は省略）", ResponseWire(response,
            new { keys = keySet.Keys.Select(key => new { kty = key.Kty, kid = key.Kid, alg = key.Alg, n = "[公開鍵の値を省略]", e = key.E }) }));
        var handler = new JsonWebTokenHandler { MapInboundClaims = false };
        var result = await handler.ValidateTokenAsync(a.IdToken!, new TokenValidationParameters
        {
            AuthenticationType = "oidc-lens-lab", RequireSignedTokens = true, ValidateIssuerSigningKey = true,
            IssuerSigningKeys = keySet.GetSigningKeys(), ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
            ValidateIssuer = true, ValidIssuer = Issuer, ValidateAudience = true, ValidAudience = ClientId,
            ValidateLifetime = true, RequireExpirationTime = true, ClockSkew = TimeSpan.FromSeconds(30)
        });
        var jwt = result.SecurityToken as JsonWebToken;
        var identity = result.ClaimsIdentity;
        var azp = identity?.FindFirst("azp")?.Value;
        if (!result.IsValid || jwt is null || identity is null || !Equal(identity.FindFirst("nonce")?.Value, a.Nonce)
            || string.IsNullOrEmpty(identity.FindFirst("sub")?.Value)
            || jwt.IssuedAt == DateTime.MinValue || jwt.IssuedAt > clock.GetUtcNow().UtcDateTime.AddSeconds(30)
            || (azp is not null && azp != ClientId) || (jwt.Audiences.Count() > 1 && azp != ClientId))
        {
            Log(a, "validate", "client", "client", "internal", "IDトークンの検証に失敗。ログインを成立させない", "署名・発行者・宛先・期限・nonce等の検証: FAIL\n今回のログイン: 未成立");
            a.Fail("IDトークンを検証できませんでした。ログイン用Cookieは発行していません。");
            return;
        }
        a.Principal = new ClaimsPrincipal(identity);
        Log(a, "validate", "client", "client", "internal", "署名と要求への対応を実際に検証", Json(new
        {
            id_token = A("id-token", a.IdToken), issuer = jwt.Issuer, audience = jwt.Audiences,
            subject = A("sub", identity.FindFirst("sub")!.Value), expires = jwt.ValidTo.ToString("O", CultureInfo.InvariantCulture),
            nonce = A("nonce", identity.FindFirst("nonce")!.Value), checks = "signature / RS256 / iss / aud / exp / iat / nonce / azp: PASS",
            login = "まだCookieを発行していない"
        }));
        a.Phase = "validated";
        a.NextRequest = "サーバー内部: 検証済みユーザーとアクセストークンをセッションに保存\nブラウザへの応答: ログイン用Set-Cookie（トークン自体は渡さない）";
    }
    private async Task Session(LabAttempt a, HttpContext http)
    {
        BrowserCommand(a, "session", http);
        var properties = new AuthenticationProperties { ExpiresUtc = clock.GetUtcNow().AddMinutes(15), IsPersistent = false };
        properties.Items["lab-attempt"] = a.Id;
        properties.StoreTokens([new AuthenticationToken { Name = "access_token", Value = a.AccessToken! }]);
        await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, a.Principal!, properties);
        Log(a, "session", "client", "client", "internal", "検証済みの認証結果からサーバー側セッションを作成",
            $"試行 = {a.Id}\naccess_token = {A("access-token", a.AccessToken)}\n保存場所: サーバーのセッションストア\nログイン成立: PASS");
        Log(a, "session", "client", "browser", "response", "この応答でログイン用Cookieを初めて発行",
            "HTTP/1.1 200 OK\nSet-Cookie: __Host-oidc-lens-session=[サーバー側セッションの参照]; Path=/; Secure; HttpOnly; SameSite=Lax\n（Cookie値は表示しない。トークンは本文に含めない）");
        a.Phase = "session-established";
        a.NextRequest = RequestWire("GET", new Uri(new Uri(config["ResourceApi:BaseAddress"]!), "/protected").AbsoluteUri,
            "Authorization: Bearer " + A("access-token", a.AccessToken));
    }
    private async Task Resource(LabAttempt a, HttpContext http)
    {
        var session = await http.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        if (!session.Succeeded || session.Properties is null || !session.Properties.Items.TryGetValue("lab-attempt", out var sessionAttempt) || sessionAttempt != a.Id) throw new InvalidOperationException("Lab session missing.");
        BrowserCommand(a, "api", http);
        var client = clients.CreateClient(ResourceAccess.ClientName);
        var url = new Uri(client.BaseAddress!, "/protected").AbsoluteUri;
        Log(a, "api", "client", "resource", "request", "保存したアクセストークンで実際のResource APIを呼ぶ",
            RequestWire("GET", url, "Authorization: Bearer " + A("access-token", a.AccessToken)));
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", a.AccessToken);
        using var response = await client.SendAsync(request, http.RequestAborted);
        var message = response.IsSuccessStatusCode ? "Protected resource reached." : null;
        if (response.IsSuccessStatusCode)
        {
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(http.RequestAborted), cancellationToken: http.RequestAborted);
            if (!document.RootElement.TryGetProperty("message", out var field) || field.GetString() != message) throw new InvalidOperationException("Unexpected resource response.");
        }
        Log(a, "api", "resource", "client", "response", "Resource APIが実際に返した応答（API内部の検査ログは未観測）",
            ResponseWire(response, message is null ? null : (object)new { message }));
        if (!response.IsSuccessStatusCode) { a.Fail("Resource APIに拒否されました。HTTPステータスを確認してください。"); return; }
        a.ResourceMessage = message;
        a.Phase = "complete";
        a.NextRequest = null;
        Log(a, "api", "client", "browser", "response", "実験画面への応答本文から取得結果を抜粋", "HTTP/1.1 200 OK\nContent-Type: application/json\n\n（LabSnapshot応答のresourceMessage項目を抜粋）\n" + Json(new { resourceMessage = message }));
    }
    private static bool Equal(string? actual, string expected) => actual is not null &&
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(actual), Encoding.UTF8.GetBytes(expected));
}
