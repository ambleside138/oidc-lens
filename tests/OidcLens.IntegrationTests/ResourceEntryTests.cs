using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;

namespace OidcLens.IntegrationTests;

public partial class LoginTests
{
    [Fact]
    public async Task Opening_data_authenticates_then_returns_to_the_same_resource_with_a_cookie()
    {
        using var issuer = new DemoIssuer();
        using var app = CreateApp(issuer);
        using var stub = new ResourceStub();
        using var resourceApp = app.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddHttpClient("resource-api", client => client.BaseAddress = new Uri("https://resource.example"))
                .ConfigurePrimaryHttpMessageHandler(() => stub)));
        using var browser = CreateBrowser(resourceApp);

        var authorization = await StartLogin(browser, "/my-data?returnUrl=https%3A%2F%2Fevil.example%2F");
        Assert.Equal(0, stub.Calls);
        issuer.Nonce = authorization["nonce"];
        using var callback = await CompleteLogin(browser, authorization["state"]!);
        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        Assert.Equal("/my-data", callback.Headers.Location!.OriginalString);

        using var resource = await browser.GetAsync(callback.Headers.Location);
        Assert.Equal(HttpStatusCode.OK, resource.StatusCode);
        Assert.Equal("no-store", resource.Headers.CacheControl!.ToString());
        var body = await resource.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("reached").GetBoolean());
        Assert.Equal(stub.Message, body.GetProperty("message").GetString());
        Assert.Equal(1, stub.Calls);

        var attempts = await browser.GetFromJsonAsync<JsonElement>("/api/attempts");
        var id = Assert.Single(attempts.EnumerateArray()).GetProperty("id").GetString()!;
        var history = await History(browser, id);
        Assert.Equal(new[] { "resource-request", "authorization-request", "callback", "code-exchange",
            "token-http", "session", "api-browser", "api-resource" }, StepIds(history));
        var steps = history.GetProperty("steps");
        Assert.Equal("/my-data", steps[0].GetProperty("url").GetString());
        Assert.Equal("absent", steps[0].GetProperty("request").GetProperty("Cookie").GetString());
        Assert.Equal("/my-data", steps[1].GetProperty("url").GetString());
        Assert.Equal(302, steps[1].GetProperty("status").GetInt32());
        Assert.Equal("/my-data", steps[2].GetProperty("response").GetProperty("Location").GetString());
        Assert.Equal("present", steps[2].GetProperty("response").GetProperty("Set-Cookie").GetString());
        Assert.Equal("GET", steps[6].GetProperty("method").GetString());
        Assert.Equal("/my-data", steps[6].GetProperty("url").GetString());
        Assert.Equal("present", steps[6].GetProperty("request").GetProperty("Cookie").GetString());
        Assert.Equal(200, steps[6].GetProperty("status").GetInt32());
        Assert.DoesNotContain("access-token-from-issuer", history.GetRawText());
        Assert.DoesNotContain("evil.example", history.GetRawText());

        using var again = await browser.GetAsync("/my-data");
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Null(again.Headers.Location);
        Assert.Equal(2, stub.Calls);
        Assert.Single((await browser.GetFromJsonAsync<JsonElement>("/api/attempts")).EnumerateArray());
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    public async Task Resource_rejection_does_not_claim_success_or_restart_authentication(HttpStatusCode status)
    {
        using var issuer = new DemoIssuer();
        using var app = CreateApp(issuer);
        using var stub = new ResourceStub { Status = status };
        using var resourceApp = app.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddHttpClient("resource-api", client => client.BaseAddress = new Uri("https://resource.example"))
                .ConfigurePrimaryHttpMessageHandler(() => stub)));
        using var browser = CreateBrowser(resourceApp);
        var authorization = await StartLogin(browser, "/my-data");
        issuer.Nonce = authorization["nonce"];
        using var callback = await CompleteLogin(browser, authorization["state"]!);
        using var resource = await browser.GetAsync(callback.Headers.Location);
        Assert.Equal(status, resource.StatusCode);
        Assert.Null(resource.Headers.Location);
        Assert.DoesNotContain("reached", await resource.Content.ReadAsStringAsync());
        using var session = await browser.GetAsync("/api/session");
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);
    }

    [Fact]
    public async Task Expired_teaching_history_does_not_prevent_access_with_a_valid_session()
    {
        using var issuer = new DemoIssuer();
        using var app = CreateApp(issuer);
        using var stub = new ResourceStub();
        var clock = new TestClock();
        using var resourceApp = app.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.AddSingleton<TimeProvider>(clock);
            services.AddHttpClient("resource-api", client => client.BaseAddress = new Uri("https://resource.example"))
                .ConfigurePrimaryHttpMessageHandler(() => stub);
        }));
        using var browser = CreateBrowser(resourceApp);
        var authorization = await StartLogin(browser, "/my-data");
        issuer.Nonce = authorization["nonce"];
        using var callback = await CompleteLogin(browser, authorization["state"]!);
        clock.Now += TimeSpan.FromMinutes(16);
        using var resource = await browser.GetAsync("/my-data");
        Assert.Equal(HttpStatusCode.OK, resource.StatusCode);
        Assert.Equal(1, stub.Calls);
        Assert.Empty((await browser.GetFromJsonAsync<JsonElement>("/api/attempts")).EnumerateArray());
        using var request = new HttpRequestMessage(HttpMethod.Get, "/my-data");
        request.Headers.Accept.ParseAdd("text/html");
        using var page = await browser.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        var html = await page.Content.ReadAsStringAsync();
        Assert.Contains("学習画面へ戻る", html);
        Assert.DoesNotContain("attempt=", html);
    }

    [Fact]
    public async Task Browser_data_page_encodes_resource_content_and_links_back_to_the_matching_attempt()
    {
        using var issuer = new DemoIssuer();
        using var app = CreateApp(issuer);
        using var stub = new ResourceStub { Message = "<script>alert('not executable')</script>" };
        using var resourceApp = app.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddHttpClient("resource-api", client => client.BaseAddress = new Uri("https://resource.example"))
                .ConfigurePrimaryHttpMessageHandler(() => stub)));
        using var browser = CreateBrowser(resourceApp);
        var authorization = await StartLogin(browser, "/my-data");
        issuer.Nonce = authorization["nonce"];
        using var callback = await CompleteLogin(browser, authorization["state"]!);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/my-data");
        request.Headers.Accept.ParseAdd("text/html");
        using var resource = await browser.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, resource.StatusCode);
        Assert.Equal("text/html", resource.Content.Headers.ContentType!.MediaType);
        var html = await resource.Content.ReadAsStringAsync();
        Assert.Contains("データを取得できました", html);
        Assert.DoesNotContain("<script>", html);
        var attempts = await browser.GetFromJsonAsync<JsonElement>("/api/attempts");
        var id = Assert.Single(attempts.EnumerateArray()).GetProperty("id").GetString();
        Assert.Contains($"/?attempt={id}#journey/start", html);
        Assert.DoesNotContain("access-token-from-issuer", html);
    }
}
