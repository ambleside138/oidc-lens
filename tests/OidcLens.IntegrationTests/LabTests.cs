using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace OidcLens.IntegrationTests;

public sealed class LabTests
{
    [Fact]
    public async Task Every_stage_waits_for_its_command_and_only_verified_identity_gets_a_cookie()
    {
        using var provider = new Provider();
        using var app = App(provider);
        using var browser = Browser(app);
        var prepared = await Prepare(browser);
        var id = prepared.GetProperty("id").GetString()!;
        Assert.Equal("prepared", prepared.GetProperty("phase").GetString());
        Assert.Equal(0, provider.TokenCalls);
        await Authorize(browser, provider, id);
        Assert.Equal(0, provider.TokenCalls);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/session")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await browser.PostAsJsonAsync($"/api/lab/{id}/session", new { })).StatusCode);
        var tokens = await Command(browser, id, "token", new { pkce = "correct" });
        Assert.Equal("tokens-received", tokens.GetProperty("phase").GetString());
        Assert.Equal(1, provider.TokenCalls);
        Assert.Equal(0, provider.KeyCalls);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/session")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await browser.PostAsJsonAsync($"/api/lab/{id}/token", new { pkce = "correct" })).StatusCode);
        var verified = await Command(browser, id, "validate", new { });
        Assert.Equal("validated", verified.GetProperty("phase").GetString());
        Assert.Equal(1, provider.KeyCalls);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/session")).StatusCode);
        var sessionResponse = await browser.PostAsJsonAsync($"/api/lab/{id}/session", new { });
        Assert.Equal(HttpStatusCode.OK, sessionResponse.StatusCode);
        Assert.Contains(sessionResponse.Headers.GetValues("Set-Cookie"), value => value.StartsWith("__Host-oidc-lens-session="));
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/session")).StatusCode);
        var complete = await Command(browser, id, "resource", new { });
        Assert.Equal("complete", complete.GetProperty("phase").GetString());
        Assert.Equal(1, provider.ResourceCalls);
        Assert.Equal("Protected resource reached.", complete.GetProperty("resourceMessage").GetString());
        var safe = complete.GetRawText();
        foreach (var secret in new[] { "lab-code-secret", provider.IdToken!, "lab-access-token-secret", provider.State!, provider.Nonce!, provider.Verifier! }) Assert.DoesNotContain(secret, safe);
        await Prepare(browser);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/session")).StatusCode);
    }

    [Fact]
    public async Task Wrong_pkce_is_a_real_rejection_and_a_new_attempt_keeps_the_safe_response_for_comparison()
    {
        using var provider = new Provider(); using var app = App(provider); using var browser = Browser(app);
        var prepared = await Prepare(browser); var id = prepared.GetProperty("id").GetString()!;
        await Authorize(browser, provider, id);
        var result = await Command(browser, id, "token", new { pkce = "wrong" });
        Assert.Equal("failed", result.GetProperty("phase").GetString());
        Assert.Contains("400 Bad Request", result.GetRawText());
        Assert.Contains("invalid_grant", result.GetRawText());
        Assert.Equal(HttpStatusCode.Conflict, (await browser.PostAsJsonAsync($"/api/lab/{id}/session", new { })).StatusCode);
        var fresh = await Prepare(browser);
        Assert.NotEqual(id, fresh.GetProperty("id").GetString());
        Assert.Contains("invalid_grant", fresh.GetProperty("previousTokenResponse").GetString());
    }

    [Theory]
    [InlineData("nonce")]
    [InlineData("signature")]
    [InlineData("unsigned")]
    [InlineData("expired")]
    public async Task Invalid_id_token_never_reaches_cookie_issuance(string failure)
    {
        using var provider = new Provider(failure); using var app = App(provider); using var browser = Browser(app);
        var id = (await Prepare(browser)).GetProperty("id").GetString()!;
        await Authorize(browser, provider, id);
        await Command(browser, id, "token", new { pkce = "correct" });
        var result = await Command(browser, id, "validate", new { });
        Assert.Equal("failed", result.GetProperty("phase").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await browser.PostAsJsonAsync($"/api/lab/{id}/session", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/session")).StatusCode);
    }

    [Theory]
    [InlineData("missing-id-token")]
    [InlineData("bad-ttl")]
    public async Task Malformed_success_response_ends_the_attempt_instead_of_leaving_a_consumed_code_pending(string failure)
    {
        using var provider = new Provider(failure); using var app = App(provider); using var browser = Browser(app);
        var id = (await Prepare(browser)).GetProperty("id").GetString()!;
        await Authorize(browser, provider, id);
        var response = await browser.PostAsJsonAsync($"/api/lab/{id}/token", new { pkce = "correct" });
        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("failed", result.GetProperty("phase").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await browser.PostAsJsonAsync($"/api/lab/{id}/token", new { pkce = "correct" })).StatusCode);
    }

    [Fact]
    public async Task Empty_api_401_is_not_fabricated_as_a_json_body()
    {
        using var provider = new Provider("api-401"); using var app = App(provider); using var browser = Browser(app);
        var id = (await Prepare(browser)).GetProperty("id").GetString()!;
        await Authorize(browser, provider, id);
        await Command(browser, id, "token", new { pkce = "correct" });
        await Command(browser, id, "validate", new { });
        await Command(browser, id, "session", new { });
        var result = await Command(browser, id, "resource", new { });
        Assert.Equal("failed", result.GetProperty("phase").GetString());
        Assert.Contains("401 Unauthorized", result.GetRawText());
        Assert.DoesNotContain("resource_rejected", result.GetRawText());
    }

    [Fact]
    public async Task Different_owner_wrong_state_and_cross_site_command_cannot_advance_an_attempt()
    {
        using var provider = new Provider(); using var app = App(provider); using var browser = Browser(app); using var other = Browser(app);
        var id = (await Prepare(browser)).GetProperty("id").GetString()!;
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync($"/api/lab/{id}/token", new { pkce = "correct" })).StatusCode);
        await browser.GetAsync($"/auth/lab/start?id={id}");
        Assert.Equal(HttpStatusCode.BadRequest, (await browser.GetAsync("/auth/lab/callback?state=wrong&code=stolen")).StatusCode);
        Assert.Equal(0, provider.TokenCalls);
        other.DefaultRequestHeaders.Remove("X-Oidc-Lens");
        Assert.Equal(HttpStatusCode.BadRequest, (await other.PostAsJsonAsync("/api/lab", new { })).StatusCode);
    }

    private static WebApplicationFactory<Program> App(Provider provider) => new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
    {
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Oidc:Authority"] = Provider.Issuer, ["Oidc:ClientId"] = "ordinary-client", ["Lab:Enabled"] = "true", ["Lab:ClientId"] = "lab-client",
            ["Lab:RedirectUri"] = "https://localhost/auth/lab/callback", ["ResourceApi:BaseAddress"] = "https://resource.example"
        }));
        builder.ConfigureServices(services =>
        {
            services.AddHttpClient("lab-provider").ConfigurePrimaryHttpMessageHandler(() => provider);
            services.AddHttpClient("resource-api").ConfigurePrimaryHttpMessageHandler(() => provider);
        });
    });
    private static HttpClient Browser(WebApplicationFactory<Program> app)
    {
        var client = app.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("X-Oidc-Lens", "workshop");
        return client;
    }
    private static async Task<JsonElement> Prepare(HttpClient browser) { var response = await browser.PostAsJsonAsync("/api/lab", new { }); response.EnsureSuccessStatusCode(); return await response.Content.ReadFromJsonAsync<JsonElement>(); }
    private static async Task<JsonElement> Command(HttpClient browser, string id, string action, object data) { var response = await browser.PostAsJsonAsync($"/api/lab/{id}/{action}", data); response.EnsureSuccessStatusCode(); return await response.Content.ReadFromJsonAsync<JsonElement>(); }
    private static async Task Authorize(HttpClient browser, Provider provider, string id)
    {
        var start = await browser.GetAsync($"/auth/lab/start?id={id}");
        Assert.Equal(HttpStatusCode.Redirect, start.StatusCode);
        var query = QueryHelpers.ParseQuery(start.Headers.Location!.Query);
        provider.Challenge = query["code_challenge"];
        provider.Nonce = query["nonce"];
        provider.State = query["state"];
        var callback = await browser.GetAsync("/auth/lab/callback?code=lab-code-secret&state=" + Uri.EscapeDataString(provider.State!) + "&iss=" + Uri.EscapeDataString(Provider.Issuer));
        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        Assert.DoesNotContain(callback.Headers.TryGetValues("Set-Cookie", out var values) ? values : [], value => value.StartsWith("__Host-oidc-lens-session="));
    }
    private sealed class Provider(string? failure = null) : HttpMessageHandler
    {
        public const string Issuer = "https://issuer.example";
        private readonly RSA key = RSA.Create(2048);
        public string? State, Nonce, Challenge, Verifier, IdToken;
        public int TokenCalls, KeyCalls, ResourceCalls;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            if (path == "/.well-known/openid-configuration") return Ok(new { issuer = Issuer, authorization_endpoint = Issuer + "/authorize", token_endpoint = Issuer + "/token", jwks_uri = Issuer + "/jwks" });
            if (path == "/jwks")
            {
                KeyCalls++;
                var publicKey = key.ExportParameters(false);
                return Ok(new { keys = new[] { new { kty = "RSA", kid = "lab-key", alg = "RS256", use = "sig", n = WebEncoders.Base64UrlEncode(publicKey.Modulus!), e = WebEncoders.Base64UrlEncode(publicKey.Exponent!) } } });
            }
            if (path == "/protected")
            {
                ResourceCalls++;
                Assert.Equal("Bearer lab-access-token-secret", request.Headers.Authorization!.ToString());
                return failure == "api-401" ? new HttpResponseMessage(HttpStatusCode.Unauthorized) : Ok(new { message = "Protected resource reached." });
            }
            Assert.Equal("/token", path);
            TokenCalls++;
            var form = QueryHelpers.ParseQuery(await request.Content!.ReadAsStringAsync(cancellationToken));
            Assert.False(form.ContainsKey("client_secret"));
            Assert.Equal("lab-code-secret", form["code"]);
            Verifier = form["code_verifier"];
            if (WebEncoders.Base64UrlEncode(SHA256.HashData(Encoding.ASCII.GetBytes(Verifier!))) != Challenge)
                return new HttpResponseMessage(HttpStatusCode.BadRequest) { Content = JsonContent.Create(new { error = "invalid_grant" }) };
            if (failure == "missing-id-token") return Ok(new { access_token = "lab-access-token-secret", token_type = "Bearer" });
            using var wrongKey = RSA.Create(2048);
            IdToken = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
            {
                Issuer = Issuer, Audience = "lab-client", Expires = DateTime.UtcNow.AddMinutes(failure == "expired" ? -1 : 5),
                IssuedAt = DateTime.UtcNow.AddMinutes(-2), NotBefore = DateTime.UtcNow.AddMinutes(-2),
                Claims = new Dictionary<string, object> { ["sub"] = "lab-user", ["nonce"] = failure == "nonce" ? "wrong-nonce" : Nonce! },
                SigningCredentials = failure == "unsigned" ? null : new SigningCredentials(new RsaSecurityKey(failure == "signature" ? wrongKey : key) { KeyId = "lab-key" }, SecurityAlgorithms.RsaSha256)
            });
            return Ok(new { access_token = "lab-access-token-secret", id_token = IdToken, token_type = "Bearer", expires_in = failure == "bad-ttl" ? (object)"not-an-integer" : 300 });
        }
        private static HttpResponseMessage Ok(object data) => new(HttpStatusCode.OK) { Content = JsonContent.Create(data) };
        protected override void Dispose(bool disposing) { if (disposing) key.Dispose(); base.Dispose(disposing); }
    }
}
