using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Authentication;
using OidcLens.Bff.Tracing;

namespace OidcLens.Bff.Auth;

internal static class ResourceAccess
{
    public const string ClientName = "resource-api";

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

        using var client = clients.CreateClient(ClientName);
        if (client.BaseAddress is null)
            return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);

        var browserStep = new TraceStep("api-browser", "http", "Browser", "App", "POST",
            "/api/attempts/{id}/resource", Request: new Dictionary<string, string> { ["Cookie"] = "present" });
        var url = new Uri(client.BaseAddress, "/protected");
        var apiStep = new TraceStep("api-resource", "http", "App", "Resource API", "GET",
            TraceCapture.PublicUrl(url), Request: new Dictionary<string, string> { ["Authorization"] = "Bearer" });
        history.Record(id, browserStep);
        history.Record(id, apiStep);

        int appStatus;
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead,
                context.RequestAborted);
            history.Record(id, apiStep with { Status = (int)response.StatusCode });
            appStatus = response.StatusCode switch
            {
                HttpStatusCode.OK => StatusCodes.Status200OK,
                HttpStatusCode.Unauthorized => StatusCodes.Status401Unauthorized,
                HttpStatusCode.Forbidden => StatusCodes.Status403Forbidden,
                _ => StatusCodes.Status502BadGateway
            };
        }
        catch (HttpRequestException)
        {
            appStatus = StatusCodes.Status502BadGateway;
        }
        catch (OperationCanceledException) when (!context.RequestAborted.IsCancellationRequested)
        {
            appStatus = StatusCodes.Status504GatewayTimeout;
        }

        history.Record(id, browserStep with { Status = appStatus });
        return appStatus == StatusCodes.Status200OK
            ? Results.Ok(new { reached = true })
            : Results.StatusCode(appStatus);
    }
}
