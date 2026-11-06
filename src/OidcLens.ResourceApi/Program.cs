using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace OidcLens.ResourceApi;

public partial class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        var issuer = builder.Configuration["Oidc:Authority"];
        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = issuer;
                options.Audience = builder.Configuration["Oidc:Audience"];
                options.IncludeErrorDetails = false;
                options.MapInboundClaims = false;
                options.TokenValidationParameters.ValidIssuer = issuer;
                options.TokenValidationParameters.ValidAlgorithms = [SecurityAlgorithms.RsaSha256];
                options.TokenValidationParameters.ClockSkew = TimeSpan.FromSeconds(30);
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = context =>
                    {
                        // Keycloak marks its access tokens with the Bearer payload type.
                        if (context.Principal?.FindFirst("typ")?.Value != "Bearer")
                            context.Fail("An access token is required.");
                        return Task.CompletedTask;
                    }
                };
            });
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGet("/protected", () => Results.Ok(new { message = "Protected resource reached." }))
            .RequireAuthorization();
        app.Run();
    }
}
