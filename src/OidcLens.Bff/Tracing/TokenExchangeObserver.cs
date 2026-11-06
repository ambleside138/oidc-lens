namespace OidcLens.Bff.Tracing;

internal sealed class TokenExchangeObserver(IHttpContextAccessor accessor) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var trace = accessor.HttpContext?.Features.Get<TraceCapture>();
        if (trace is not { RedeemingCode: true } || request.Method != HttpMethod.Post)
            return await base.SendAsync(request, cancellationToken);

        var step = new TraceStep("token-http", "http", "App", "IdP",
            request.Method.Method, TraceCapture.PublicUrl(request.RequestUri), Request: trace.TokenRequest);
        trace.RecordTokenHttp(step);
        var response = await base.SendAsync(request, cancellationToken);
        trace.RecordTokenHttp(step with { Status = (int)response.StatusCode });
        return response;
    }
}
