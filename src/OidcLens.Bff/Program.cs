using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using OidcLens.Bff.Auth;

var builder = WebApplication.CreateBuilder(args);
var oidc = builder.Configuration.GetSection("Oidc");

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ITicketStore, MemoryTicketStore>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "__Host-oidc-lens-session";
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
        options.Events.OnTokenResponseReceived = context =>
        {
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
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => Results.Redirect("/index.html"));
app.MapGet("/auth/login", () => Results.Challenge(
    new AuthenticationProperties { RedirectUri = "/" }, [OpenIdConnectDefaults.AuthenticationScheme]));
app.MapGet("/api/session", () => Results.Ok(new { authenticated = true })).RequireAuthorization();

app.Run();

public partial class Program;
