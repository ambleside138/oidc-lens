using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using OidcLens.Bff.Tracing;

namespace OidcLens.Bff.Auth;

internal static class ResourceAccess
{
    public const string ClientName = "resource-api";

    public static async Task<IResult> Open(
        HttpContext context, AttemptHistory history, IHttpClientFactory clients)
    {
        if (context.User.Identity?.IsAuthenticated != true)
            return Results.Challenge(TraceCapture.StartLogin(context, history, returnToResource: true),
                [OpenIdConnectDefaults.AuthenticationScheme]);

        var session = await context.AuthenticateAsync();
        if (session.Properties?.GetTokenValue("access_token") is not { Length: > 0 } token)
            return Results.Unauthorized();

        session.Properties.Items.TryGetValue(TraceCapture.AttemptProperty, out var id);
        var owner = TraceCapture.GetOrCreateOwner(context);
        // Expired or unavailable teaching history must not invalidate a valid login session.
        var traceId = id is not null && history.Find(owner, id) is not null ? id : null;
        var browserStep = new TraceStep("api-browser", "http", "Browser", "App", "GET", "/my-data",
            Request: new Dictionary<string, string> { ["Cookie"] = "present" });
        if (traceId is not null) history.Record(traceId, browserStep);
        var outcome = await Fetch(context, history, clients, traceId, token, readMessage: true);
        if (traceId is not null) history.Record(traceId, browserStep with { Status = outcome.Status });
        if (outcome.Status != StatusCodes.Status200OK)
            return Results.StatusCode(outcome.Status);

        var data = new { reached = true, message = outcome.Message };
        return context.Request.GetTypedHeaders().Accept?.Any(value =>
            value.Quality.GetValueOrDefault(1) > 0 &&
            value.MediaType.Value?.Equals("text/html", StringComparison.OrdinalIgnoreCase) == true) == true
            ? Results.Content(ResourcePage.Render(JsonSerializer.Serialize(data), traceId), "text/html; charset=utf-8")
            : Results.Ok(data);
    }

    public static async Task<IResult> Call(
        string id, HttpContext context, AttemptHistory history, IHttpClientFactory clients)
    {
        if (context.Request.Headers["X-Oidc-Lens"] != "workshop")
            return Results.BadRequest();

        var owner = TraceCapture.GetOrCreateOwner(context);
        if (history.Find(owner, id) is null)
            return Results.NotFound();

        var session = await context.AuthenticateAsync();
        if (session.Properties is null ||
            !session.Properties.Items.TryGetValue(TraceCapture.AttemptProperty, out var activeId) ||
            activeId != id || session.Properties.GetTokenValue("access_token") is not { } token)
            return Results.Conflict();

        var browserStep = new TraceStep("api-browser", "http", "Browser", "App", "POST",
            "/api/attempts/{id}/resource", Request: new Dictionary<string, string> { ["Cookie"] = "present" });
        history.Record(id, browserStep);
        var outcome = await Fetch(context, history, clients, id, token);
        history.Record(id, browserStep with { Status = outcome.Status });
        return outcome.Status == StatusCodes.Status200OK
            ? Results.Ok(new { reached = true })
            : Results.StatusCode(outcome.Status);
    }

    private sealed record Outcome(int Status, string? Message = null);

    private static async Task<Outcome> Fetch(HttpContext context, AttemptHistory history,
        IHttpClientFactory clients, string? id, string token, bool readMessage = false)
    {
        using var client = clients.CreateClient(ClientName);
        if (client.BaseAddress is null)
            return new Outcome(StatusCodes.Status503ServiceUnavailable);

        var url = new Uri(client.BaseAddress, "/protected");
        var apiStep = new TraceStep("api-resource", "http", "App", "Resource API", "GET",
            TraceCapture.PublicUrl(url), Request: new Dictionary<string, string> { ["Authorization"] = "Bearer" });
        if (id is not null) history.Record(id, apiStep);

        int appStatus;
        string? message = null;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        timeout.CancelAfter(client.Timeout);
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead,
                timeout.Token);
            if (id is not null) history.Record(id, apiStep with { Status = (int)response.StatusCode });
            appStatus = response.StatusCode switch
            {
                HttpStatusCode.OK => StatusCodes.Status200OK,
                HttpStatusCode.Unauthorized => StatusCodes.Status401Unauthorized,
                HttpStatusCode.Forbidden => StatusCodes.Status403Forbidden,
                _ => StatusCodes.Status502BadGateway
            };
            if (readMessage && appStatus == StatusCodes.Status200OK)
            {
                var body = await response.Content.ReadFromJsonAsync<JsonElement>(timeout.Token);
                if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("message", out var value) ||
                    value.ValueKind != JsonValueKind.String)
                    return new Outcome(StatusCodes.Status502BadGateway);
                message = value.GetString();
            }
        }
        catch (HttpRequestException)
        {
            appStatus = StatusCodes.Status502BadGateway;
        }
        catch (OperationCanceledException) when (!context.RequestAborted.IsCancellationRequested)
        {
            appStatus = StatusCodes.Status504GatewayTimeout;
        }
        catch (JsonException)
        {
            appStatus = StatusCodes.Status502BadGateway;
        }
        return new Outcome(appStatus, message);
    }
}
