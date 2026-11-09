using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace OidcLens.IntegrationTests;

public partial class LoginTests
{
    [Fact]
    public async Task Signed_code_exchange_establishes_a_session_with_a_server_side_access_token()
    {
        using var issuer = new DemoIssuer();
        using var app = CreateApp(issuer);
        using var browser = CreateBrowser(app);

        using var anonymous = await browser.GetAsync("/api/session");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        var authorization = await StartLogin(browser);
        Assert.Equal("code", authorization["response_type"]);
        Assert.Equal("S256", authorization["code_challenge_method"]);
        Assert.Equal("https://localhost/signin-oidc", authorization["redirect_uri"]);
        Assert.False(authorization.ContainsKey("request_uri"));

        issuer.Nonce = authorization["nonce"];
        using var callback = await CompleteLogin(browser, authorization["state"]!);

        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        Assert.NotEmpty(AttemptId(callback));
        var exchange = issuer.CodeExchange!;
        Assert.Equal("authorization_code", exchange["grant_type"]);
        Assert.Equal("code-from-issuer", exchange["code"]);
        Assert.Equal("confidential-test-client-secret", exchange["client_secret"]);
        var verifier = Encoding.ASCII.GetBytes(exchange["code_verifier"]!);
        Assert.Equal(authorization["code_challenge"], WebEncoders.Base64UrlEncode(SHA256.HashData(verifier)));

        var sessionCookie = Assert.Single(callback.Headers.GetValues("Set-Cookie"),
            value => value.StartsWith("__Host-oidc-lens-session=", StringComparison.Ordinal));
        Assert.Contains("secure", sessionCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", sessionCookie, StringComparison.OrdinalIgnoreCase);
        var options = app.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(CookieAuthenticationDefaults.AuthenticationScheme);
        var cookieValue = sessionCookie.Split(';')[0].Split('=', 2)[1];
        var cookieTicket = Assert.IsType<AuthenticationTicket>(options.TicketDataFormat.Unprotect(cookieValue));
        Assert.Empty(cookieTicket.Properties.GetTokens());
        var storeKey = Assert.Single(cookieTicket.Principal.Claims).Value;
        var serverTicket = await options.SessionStore!.RetrieveAsync(storeKey);
        Assert.Equal("access-token-from-issuer", serverTicket!.Properties.GetTokenValue("access_token"));
        Assert.Null(serverTicket.Properties.GetTokenValue("id_token"));
        Assert.Null(serverTicket.Properties.GetTokenValue("refresh_token"));

        using var session = await browser.GetAsync("/api/session");
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);
        var body = await session.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("authenticated").GetBoolean());
    }

    [Theory]
    [InlineData("unsigned")]
    [InlineData("wrong-key")]
    [InlineData("wrong-nonce")]
    [InlineData("wrong-state")]
    public async Task Invalid_oidc_responses_do_not_establish_a_session(string failure)
    {
        using var issuer = new DemoIssuer(failure);
        using var app = CreateApp(issuer);
        using var browser = CreateBrowser(app);
        var authorization = await StartLogin(browser);
        issuer.Nonce = failure == "wrong-nonce" ? "unexpected-nonce" : authorization["nonce"];

        using var callback = await CompleteLogin(browser,
            failure == "wrong-state" ? "unexpected-state" : authorization["state"]!);

        Assert.Equal(HttpStatusCode.BadRequest, callback.StatusCode);
        Assert.DoesNotContain("unexpected-", await callback.Content.ReadAsStringAsync());
        using var session = await browser.GetAsync("/api/session");
        Assert.Equal(HttpStatusCode.Unauthorized, session.StatusCode);
    }

    private static WebApplicationFactory<Program> CreateApp(DemoIssuer issuer) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.PostConfigure<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme, options =>
            {
                options.ClientId = DemoIssuer.ClientId;
                options.ClientSecret = "confidential-test-client-secret";
                options.TokenValidationParameters.ValidAudience = DemoIssuer.ClientId;
                options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(issuer.Configuration);
                var observer = Assert.IsAssignableFrom<DelegatingHandler>(options.BackchannelHttpHandler);
                observer.InnerHandler = issuer;
                options.Backchannel = new HttpClient(observer);
            });
        }));

    private static HttpClient CreateBrowser(WebApplicationFactory<Program> app) =>
        app.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

    private static async Task<Dictionary<string, StringValues>> StartLogin(HttpClient browser,
        string path = "/auth/login")
    {
        using var start = await browser.GetAsync(path);
        Assert.Equal(HttpStatusCode.Redirect, start.StatusCode);
        Assert.Equal(DemoIssuer.Issuer + "/authorize", start.Headers.Location!.GetLeftPart(UriPartial.Path));
        return QueryHelpers.ParseQuery(start.Headers.Location.Query);
    }

    private static Task<HttpResponseMessage> CompleteLogin(HttpClient browser, string state) =>
        browser.PostAsync("/signin-oidc", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["code"] = "code-from-issuer",
            ["state"] = state
        }));

    private sealed class DemoIssuer : HttpMessageHandler
    {
        public const string Issuer = "https://issuer.example";
        public const string ClientId = "test-client";

        private readonly RSA signingKey = RSA.Create(2048);
        private readonly RSA wrongKey = RSA.Create(2048);
        private readonly string? failure;

        public DemoIssuer(string? failure = null)
        {
            this.failure = failure;
            Configuration = new OpenIdConnectConfiguration
            {
                Issuer = Issuer,
                AuthorizationEndpoint = Issuer + "/authorize",
                TokenEndpoint = Issuer + "/token"
            };
            Configuration.SigningKeys.Add(new RsaSecurityKey(signingKey.ExportParameters(false)) { KeyId = "demo" });
        }

        public OpenIdConnectConfiguration Configuration { get; }
        public string? Nonce { get; set; }
        public Dictionary<string, StringValues>? CodeExchange { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal(Configuration.TokenEndpoint, request.RequestUri!.AbsoluteUri);
            CodeExchange = QueryHelpers.ParseQuery(await request.Content!.ReadAsStringAsync(cancellationToken));

            var key = new RsaSecurityKey(failure == "wrong-key" ? wrongKey : signingKey) { KeyId = "demo" };
            var idToken = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
            {
                Issuer = Issuer,
                Audience = ClientId,
                Expires = DateTime.UtcNow.AddMinutes(5),
                Claims = new Dictionary<string, object> { ["sub"] = "demo-user", ["nonce"] = Nonce! },
                SigningCredentials = failure == "unsigned" ? null : new SigningCredentials(key, SecurityAlgorithms.RsaSha256)
            });
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new
                {
                    id_token = idToken,
                    access_token = "access-token-from-issuer",
                    refresh_token = "refresh-token-from-issuer",
                    token_type = "Bearer"
                })
            };
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                signingKey.Dispose();
                wrongKey.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
