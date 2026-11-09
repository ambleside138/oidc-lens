using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace OidcLens.Bff.Tracing;

internal sealed class TraceCapture(string attemptId, AttemptHistory history)
{
    public const string AttemptProperty = "oidc-lens-attempt";
    public const string OwnerCookie = "__Host-oidc-lens-demo";
    public const string SessionCookie = "__Host-oidc-lens-session";

    public bool RedeemingCode { get; private set; }
    public IReadOnlyDictionary<string, string>? TokenRequest { get; private set; }
    public TraceStep? TokenHttp { get; private set; }
    private IdTokenInspection? idToken;

    public void Record(TraceStep step) => history.Record(attemptId, step);

    public void RecordTokenHttp(TraceStep step)
    {
        TokenHttp = step;
        Record(step);
    }

    public static string GetOrCreateOwner(HttpContext context)
    {
        if (context.Request.Cookies.TryGetValue(OwnerCookie, out var existing)
            && Guid.TryParseExact(existing, "N", out _))
            return existing;

        var owner = Guid.NewGuid().ToString("N");
        context.Response.Cookies.Append(OwnerCookie, owner, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Lax,
            Path = "/"
        });
        return owner;
    }

    public static AuthenticationProperties StartLogin(HttpContext context, AttemptHistory history,
        bool returnToResource = false)
    {
        var id = history.Start(GetOrCreateOwner(context));
        var trace = new TraceCapture(id, history);
        if (returnToResource)
            trace.Record(new TraceStep("resource-request", "http", "Browser", "App",
                context.Request.Method, "/my-data", Request: new Dictionary<string, string>
                {
                    ["Cookie"] = context.Request.Cookies.ContainsKey(SessionCookie) ? "present" : "absent"
                }));
        context.Response.OnStarting(() =>
        {
            trace.RecordAuthorizationRedirect(context);
            return Task.CompletedTask;
        });
        // Only fixed local destinations are accepted; the browser cannot choose a return URL.
        var properties = new AuthenticationProperties
        {
            RedirectUri = returnToResource ? "/my-data" : $"/?attempt={id}"
        };
        properties.Items[AttemptProperty] = id;
        return properties;
    }

    public static Task BeginCodeExchange(AuthorizationCodeReceivedContext context)
    {
        // This event runs after the handler restores protected state and checks its correlation cookie.
        if (context.Properties is null ||
            !context.Properties.Items.TryGetValue(AttemptProperty, out var id) || id is null)
            return Task.CompletedTask;

        var http = context.HttpContext;
        var trace = new TraceCapture(id, http.RequestServices.GetRequiredService<AttemptHistory>())
        {
            RedeemingCode = true,
            TokenRequest = DescribeTokenRequest(context.TokenEndpointRequest)
        };
        http.Features.Set(trace);
        var callback = new TraceStep("callback", "http", "Browser", "App",
            http.Request.Method, http.Request.Path,
            Request: new Dictionary<string, string>
            {
                ["code"] = "present", ["state"] = "present", ["error"] = "absent"
            });
        trace.Record(callback);
        trace.Record(new TraceStep("code-exchange", "auth", "App", "App"));
        http.Response.OnStarting(() =>
        {
            var issuedSessionCookie = http.Response.Headers.SetCookie.Any(value =>
                value?.StartsWith(SessionCookie + "=", StringComparison.Ordinal) == true);
            var response = new Dictionary<string, string>();
            // Publish only known local paths and cookie presence, never query strings or cookie values.
            var returnPath = http.Response.Headers.Location.ToString().Split('?', 2)[0];
            if (returnPath is "/my-data" or "/") response["Location"] = returnPath;
            if (issuedSessionCookie) response["Set-Cookie"] = "present";
            trace.Record(callback with
            {
                Status = http.Response.StatusCode,
                Response = response.Count > 0 ? response : null
            });
            if (http.Response.StatusCode == StatusCodes.Status302Found && issuedSessionCookie)
            {
                trace.Record(new TraceStep("session", "auth", "App", "App", IdToken: trace.idToken));
            }
            return Task.CompletedTask;
        });
        return Task.CompletedTask;
    }

    public static string? PublicUrl(Uri? uri) => uri is { IsAbsoluteUri: true }
        ? uri.GetComponents(UriComponents.SchemeAndServer | UriComponents.Path, UriFormat.UriEscaped)
        : null;

    public void RecordTokenFields(OpenIdConnectMessage message)
    {
        if (TokenHttp is not { } step)
            return;

        var fields = new Dictionary<string, string>();
        AddPresence(fields, message, "access_token", "id_token", "refresh_token");
        if (string.Equals(message.TokenType, "Bearer", StringComparison.OrdinalIgnoreCase))
            fields["token_type"] = "Bearer";
        RecordTokenHttp(step with { Response = fields });
    }

    public static Task CaptureDecodedIdToken(TokenValidatedContext context)
    {
        if (context.HttpContext.Features.Get<TraceCapture>() is not { } trace ||
            context.SecurityToken is not JwtSecurityToken jwt)
            return Task.CompletedTask;

        var header = new Dictionary<string, string>();
        if (jwt.Header.Alg is { } algorithm &&
            context.Options.TokenValidationParameters.ValidAlgorithms.Contains(algorithm))
            header["alg"] = algorithm;
        if (jwt.Header.Typ == "JWT")
            header["typ"] = "JWT";
        if (!string.IsNullOrEmpty(jwt.Header.Kid))
            header["kid"] = "present";

        var payload = new Dictionary<string, string>();
        if (Uri.TryCreate(jwt.Issuer, UriKind.Absolute, out var issuer) && PublicUrl(issuer) is { } issuerUrl)
            payload["iss"] = issuerUrl;
        if (context.Options.ClientId is { } clientId && jwt.Audiences.Contains(clientId))
            payload["aud"] = clientId;
        if (jwt.ValidTo != DateTime.MinValue)
            payload["exp"] = jwt.ValidTo.ToString("O", CultureInfo.InvariantCulture);
        foreach (var key in new[] { "sub", "nonce" })
        {
            if (jwt.Payload.ContainsKey(key))
                payload[key] = "present";
        }

        // The callback only publishes this candidate after the standard handler issues the session cookie.
        trace.idToken = new IdTokenInspection(header, payload, "session-established");
        return Task.CompletedTask;
    }

    private static Dictionary<string, string> DescribeTokenRequest(OpenIdConnectMessage? message)
    {
        var fields = new Dictionary<string, string>();
        if (message is null)
            return fields;

        if (message.GrantType == "authorization_code")
            fields["grant_type"] = "authorization_code";
        AddPresence(fields, message, "code", "code_verifier", "client_id", "client_secret", "redirect_uri");
        return fields;
    }

    private static void AddPresence(Dictionary<string, string> fields, OpenIdConnectMessage message, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (!string.IsNullOrEmpty(message.GetParameter(key)))
                fields[key] = "present";
        }
    }

    private void RecordAuthorizationRedirect(HttpContext context)
    {
        if (context.Response.StatusCode != StatusCodes.Status302Found ||
            !Uri.TryCreate(context.Response.Headers.Location.ToString(), UriKind.Absolute, out var location))
            return;

        var query = QueryHelpers.ParseQuery(location.Query);
        var fields = new Dictionary<string, string> { ["Location"] = PublicUrl(location)! };
        foreach (var (key, allowedValue) in new[]
        {
            ("response_type", "code"), ("response_mode", "form_post"),
            ("scope", "openid"), ("code_challenge_method", "S256")
        })
        {
            if (query.TryGetValue(key, out var value) && value.Count == 1 && value[0] == allowedValue)
                fields[key] = allowedValue;
        }
        foreach (var key in new[] { "client_id", "redirect_uri", "code_challenge", "state", "nonce" })
        {
            if (query.ContainsKey(key))
                fields[key] = "present";
        }
        Record(new TraceStep("authorization-request", "http", "App", "Browser",
            context.Request.Method, context.Request.Path.Value, context.Response.StatusCode, Response: fields));
    }
}
