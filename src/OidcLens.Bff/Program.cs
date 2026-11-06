using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using OidcLens.Bff.Auth;
using OidcLens.Bff.Tracing;

var builder = WebApplication.CreateBuilder(args);
var oidc = builder.Configuration.GetSection("Oidc");

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ITicketStore, MemoryTicketStore>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<AttemptHistory>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = TraceCapture.SessionCookie;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromMinutes(30);
        options.SlidingExpiration = false;
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
    })
    .AddOpenIdConnect(options =>
    {
        options.Authority = oidc["Authority"];
        options.ClientId = oidc["ClientId"] ?? "";
        options.ClientSecret = oidc["ClientSecret"];
        options.ResponseType = OpenIdConnectResponseType.Code;
        options.ResponseMode = OpenIdConnectResponseMode.FormPost;
        options.PushedAuthorizationBehavior = PushedAuthorizationBehavior.Disable;
        options.UsePkce = true;
        options.MapInboundClaims = false;
        options.Scope.Clear();
        options.Scope.Add("openid");
        options.TokenHandler = new SignedIdTokenHandler();
        options.TokenValidationParameters.ValidAlgorithms = [oidc["SigningAlgorithm"] ?? "RS256"];
        options.Events.OnAuthorizationCodeReceived = TraceCapture.BeginCodeExchange;
        options.Events.OnTokenValidated = TraceCapture.CaptureDecodedIdToken;
        options.Events.OnTokenResponseReceived = context =>
        {
            context.HttpContext.Features.Get<TraceCapture>()?.RecordTokenFields(context.TokenEndpointResponse);
            if (context.TokenEndpointResponse.AccessToken is { Length: > 0 } accessToken)
            {
                context.Properties!.StoreTokens([new AuthenticationToken
                {
                    Name = "access_token",
                    Value = accessToken
                }]);
            }
            return Task.CompletedTask;
        };
        options.Events.OnRemoteFailure = context =>
        {
            context.HandleResponse();
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return context.Response.WriteAsync("OIDC login failed.");
        };
    });
builder.Services.AddOptions<CookieAuthenticationOptions>(CookieAuthenticationDefaults.AuthenticationScheme)
    .Configure<ITicketStore>((options, store) => options.SessionStore = store);
builder.Services.AddOptions<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme)
    .Configure<IHttpContextAccessor>((options, accessor) =>
    {
        options.BackchannelHttpHandler = new TokenExchangeObserver(accessor)
        {
            InnerHandler = new HttpClientHandler { AllowAutoRedirect = false }
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddHttpClient(ResourceAccess.ClientName, client =>
    {
        if (Uri.TryCreate(builder.Configuration["ResourceApi:BaseAddress"], UriKind.Absolute, out var uri) &&
            uri.Scheme == Uri.UriSchemeHttps)
            client.BaseAddress = uri;
        client.Timeout = TimeSpan.FromSeconds(10);
    })
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false })
    .RemoveAllLoggers();

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
        context.Response.Headers.CacheControl = "no-store";
    await next();
});
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/auth/login", (HttpContext context, AttemptHistory history) => Results.Challenge(
    TraceCapture.StartLogin(context, history), [OpenIdConnectDefaults.AuthenticationScheme]));
app.MapGet("/api/session", () => Results.Ok(new { authenticated = true })).RequireAuthorization();
app.MapGet("/api/attempts", (HttpContext context, AttemptHistory history) =>
    Results.Ok(history.List(TraceCapture.GetOrCreateOwner(context))));
app.MapGet("/api/attempts/{id}", (string id, HttpContext context, AttemptHistory history) =>
{
    var owner = TraceCapture.GetOrCreateOwner(context);
    return history.Find(owner, id) is { } attempt ? Results.Ok(attempt) : Results.NotFound();
});
app.MapPost("/api/attempts/{id}/resource", ResourceAccess.Call).RequireAuthorization();

app.Run();

public partial class Program;
