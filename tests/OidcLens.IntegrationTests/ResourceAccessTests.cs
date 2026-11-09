using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;

namespace OidcLens.IntegrationTests;

public partial class LoginTests
{
    [Fact]
    public async Task Only_the_authenticated_attempt_can_call_the_resource_and_record_the_result()
    {
        using var issuer = new DemoIssuer();
        using var app = CreateApp(issuer);
        using var stub = new ResourceStub();
        using var resourceApp = app.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddHttpClient("resource-api", client => client.BaseAddress = new Uri("https://resource.example"))
                .ConfigurePrimaryHttpMessageHandler(() => stub)));
        using var browser = CreateBrowser(resourceApp);
        var first = await StartLogin(browser);
        issuer.Nonce = first["nonce"];
        using var firstCallback = await CompleteLogin(browser, first["state"]!);
        var firstId = AttemptId(firstCallback);
        var second = await StartLogin(browser);
        issuer.Nonce = second["nonce"];
        using var secondCallback = await CompleteLogin(browser, second["state"]!);
        var secondId = AttemptId(secondCallback);

        using var oldAttempt = await CallResource(browser, firstId);
        Assert.Equal(HttpStatusCode.Conflict, oldAttempt.StatusCode);
        using var crossOriginForm = await browser.PostAsync($"/api/attempts/{secondId}/resource", null);
        Assert.Equal(HttpStatusCode.BadRequest, crossOriginForm.StatusCode);
        Assert.Equal(0, stub.Calls);

        using var resource = await CallResource(browser, secondId);
        Assert.Equal(HttpStatusCode.OK, resource.StatusCode);
        Assert.Equal(1, stub.Calls);
        var history = await History(browser, secondId);
        Assert.Equal(new[] { "authorization-request", "callback", "code-exchange", "token-http",
            "session", "api-browser", "api-resource" }, StepIds(history));
        Assert.DoesNotContain("access-token-from-issuer", history.GetRawText());
        Assert.DoesNotContain("api-resource", StepIds(await History(browser, firstId)));
    }

    [Fact]
    public async Task Inspector_separates_decoded_fields_from_session_success()
    {
        using var issuer = new DemoIssuer();
        using var app = CreateApp(issuer);
        using var browser = CreateBrowser(app);
        var authorization = await StartLogin(browser);
        issuer.Nonce = authorization["nonce"];
        using var callback = await CompleteLogin(browser, authorization["state"]!);

        var history = await History(browser, AttemptId(callback));
        var session = history.GetProperty("steps").EnumerateArray().Single(step => step.GetProperty("id").GetString() == "session");
        var inspection = session.GetProperty("idToken");
        Assert.Equal("RS256", inspection.GetProperty("header").GetProperty("alg").GetString());
        Assert.Equal("present", inspection.GetProperty("payload").GetProperty("nonce").GetString());
        Assert.Equal("present", inspection.GetProperty("payload").GetProperty("sub").GetString());
        Assert.Equal("session-established", inspection.GetProperty("result").GetString());
        Assert.DoesNotContain(issuer.Nonce!, inspection.GetRawText());
        Assert.DoesNotContain("demo-user", inspection.GetRawText());
    }

    private static async Task<HttpResponseMessage> CallResource(HttpClient browser, string id)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/attempts/{id}/resource");
        request.Headers.Add("X-Oidc-Lens", "workshop");
        return await browser.SendAsync(request);
    }

    private sealed class ResourceStub : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public HttpStatusCode Status { get; init; } = HttpStatusCode.OK;
        public string Message { get; init; } = "Protected resource reached.";

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            Assert.Equal("https://resource.example/protected", request.RequestUri!.AbsoluteUri);
            Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
            Assert.Equal("access-token-from-issuer", request.Headers.Authorization?.Parameter);
            return Task.FromResult(new HttpResponseMessage(Status)
            {
                Content = JsonContent.Create(new { message = Message })
            });
        }
    }
}
