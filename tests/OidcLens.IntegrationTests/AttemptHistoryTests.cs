using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;

namespace OidcLens.IntegrationTests;

public partial class LoginTests
{
    [Fact]
    public async Task Interleaved_attempts_have_separate_masked_histories_visible_only_to_the_owner()
    {
        using var issuer = new DemoIssuer();
        using var app = CreateApp(issuer);
        using var browser = CreateBrowser(app);
        using var otherBrowser = CreateBrowser(app);
        var first = await StartLogin(browser);
        var second = await StartLogin(browser);

        issuer.Nonce = second["nonce"];
        using var secondCallback = await CompleteLogin(browser, second["state"]!);
        var secondId = AttemptId(secondCallback);
        var secondVerifier = issuer.CodeExchange!["code_verifier"].ToString();
        var secondHistory = await History(browser, secondId);
        Assert.Equal(new[] { "authorization-request", "callback", "code-exchange", "token-http", "session" },
            StepIds(secondHistory));

        issuer.Nonce = first["nonce"];
        using var firstCallback = await CompleteLogin(browser, first["state"]!);
        var firstId = AttemptId(firstCallback);
        Assert.NotEqual(firstId, secondId);
        var firstHistory = await History(browser, firstId);
        Assert.Equal(StepIds(secondHistory), StepIds(firstHistory));
        Assert.Equal(secondHistory.GetRawText(), (await History(browser, secondId)).GetRawText());

        using var forbidden = await otherBrowser.GetAsync($"/api/attempts/{secondId}");
        Assert.Equal(HttpStatusCode.NotFound, forbidden.StatusCode);

        var steps = secondHistory.GetProperty("steps");
        Assert.Equal(302, steps[0].GetProperty("status").GetInt32());
        Assert.Equal("S256", steps[0].GetProperty("response").GetProperty("code_challenge_method").GetString());
        Assert.Equal("POST", steps[1].GetProperty("method").GetString());
        Assert.Equal("present", steps[1].GetProperty("request").GetProperty("code").GetString());
        Assert.Equal(200, steps[3].GetProperty("status").GetInt32());
        Assert.Equal("present", steps[3].GetProperty("request").GetProperty("code_verifier").GetString());
        Assert.Equal("present", steps[3].GetProperty("response").GetProperty("id_token").GetString());
        var json = secondHistory.GetRawText();
        foreach (var secret in new[] { second["state"].ToString(), second["nonce"].ToString(),
                     second["code_challenge"].ToString(), secondVerifier, "access-token-from-issuer",
                     "code-from-issuer", "confidential-test-client-secret", "demo-user" })
        {
            Assert.DoesNotContain(secret, json);
        }
    }

    [Fact]
    public async Task A_browser_keeps_only_its_latest_eight_attempts_for_fifteen_minutes()
    {
        using var issuer = new DemoIssuer();
        using var app = CreateApp(issuer);
        var clock = new TestClock();
        using var timedApp = app.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services => services.AddSingleton<TimeProvider>(clock)));
        using var browser = CreateBrowser(timedApp);

        await StartLogin(browser);
        var first = Assert.Single((await browser.GetFromJsonAsync<JsonElement>("/api/attempts")).EnumerateArray());
        for (var count = 0; count < 8; count++)
            await StartLogin(browser);
        var latest = await browser.GetFromJsonAsync<JsonElement>("/api/attempts");
        Assert.Equal(8, latest.GetArrayLength());
        using var removed = await browser.GetAsync($"/api/attempts/{first.GetProperty("id").GetString()}");
        Assert.Equal(HttpStatusCode.NotFound, removed.StatusCode);

        clock.Now += TimeSpan.FromMinutes(15);
        var expired = await browser.GetFromJsonAsync<JsonElement>("/api/attempts");
        Assert.Empty(expired.EnumerateArray());
    }

    [Fact]
    public async Task Wrong_nonce_records_the_token_http_response_without_a_successful_session()
    {
        using var issuer = new DemoIssuer("wrong-nonce") { Nonce = "wrong-nonce-value" };
        using var app = CreateApp(issuer);
        using var browser = CreateBrowser(app);
        var authorization = await StartLogin(browser);
        using var callback = await CompleteLogin(browser, authorization["state"]!);
        Assert.Equal(HttpStatusCode.BadRequest, callback.StatusCode);

        var attempts = await browser.GetFromJsonAsync<JsonElement>("/api/attempts");
        var attempt = Assert.Single(attempts.EnumerateArray());
        var history = await History(browser, attempt.GetProperty("id").GetString()!);
        Assert.Equal(new[] { "authorization-request", "callback", "code-exchange", "token-http" }, StepIds(history));
        Assert.Equal(400, history.GetProperty("steps")[1].GetProperty("status").GetInt32());
    }

    private static string AttemptId(HttpResponseMessage callback)
    {
        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        var target = new Uri(new Uri("https://localhost"), callback.Headers.Location!);
        Assert.Equal("/", target.AbsolutePath);
        return QueryHelpers.ParseQuery(target.Query)["attempt"].ToString();
    }

    private static Task<JsonElement> History(HttpClient browser, string attemptId) =>
        browser.GetFromJsonAsync<JsonElement>($"/api/attempts/{attemptId}");

    private static string?[] StepIds(JsonElement history) => history.GetProperty("steps").EnumerateArray()
        .Select(step => step.GetProperty("id").GetString()).ToArray();

    private sealed class TestClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
