using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace OidcLens.IntegrationTests;

public class ResourceApiTests
{
    [Theory]
    [InlineData("valid", HttpStatusCode.OK)]
    [InlineData("missing", HttpStatusCode.Unauthorized)]
    [InlineData("wrong-issuer", HttpStatusCode.Unauthorized)]
    [InlineData("wrong-audience", HttpStatusCode.Unauthorized)]
    [InlineData("wrong-key", HttpStatusCode.Unauthorized)]
    [InlineData("expired", HttpStatusCode.Unauthorized)]
    [InlineData("unsigned", HttpStatusCode.Unauthorized)]
    [InlineData("id-token", HttpStatusCode.Unauthorized)]
    public async Task Resource_accepts_only_a_valid_access_token(string kind, HttpStatusCode expected)
    {
        const string issuer = "https://issuer.example";
        const string audience = "workshop-resource";
        using var issuerKey = RSA.Create(2048);
        using var wrongKey = RSA.Create(2048);
        var configuration = new OpenIdConnectConfiguration { Issuer = issuer };
        configuration.SigningKeys.Add(new RsaSecurityKey(issuerKey.ExportParameters(false)) { KeyId = "demo" });

        using var app = new WebApplicationFactory<ResourceApi.Program>().WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
                {
                    options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(configuration);
                    options.TokenValidationParameters.ValidAudience = audience;
                    options.TokenValidationParameters.ValidIssuer = issuer;
                })));
        using var client = app.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/protected");
        if (kind != "missing")
        {
            var key = new RsaSecurityKey(kind == "wrong-key" ? wrongKey : issuerKey) { KeyId = "demo" };
            var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
            {
                Issuer = kind == "wrong-issuer" ? "https://elsewhere.example" : issuer,
                Audience = kind == "wrong-audience" ? "another-resource" : audience,
                NotBefore = DateTime.UtcNow.AddHours(-2),
                IssuedAt = DateTime.UtcNow.AddHours(-2),
                Expires = DateTime.UtcNow.AddMinutes(kind == "expired" ? -1 : 5),
                SigningCredentials = kind == "unsigned" ? null : new SigningCredentials(key, SecurityAlgorithms.RsaSha256),
                Claims = new Dictionary<string, object> { ["typ"] = kind == "id-token" ? "ID" : "Bearer" }
            });
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        using var response = await client.SendAsync(request);
        Assert.Equal(expected, response.StatusCode);
    }
}
