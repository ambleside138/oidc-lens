using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace OidcLens.Bff.Auth;

internal sealed class SignedIdTokenHandler : JsonWebTokenHandler
{
    public override Task<TokenValidationResult> ValidateTokenAsync(
        string token, TokenValidationParameters validationParameters)
    {
        // The OIDC handler relaxes this on its per-request copy during code redemption.
        validationParameters.RequireSignedTokens = true;
        return base.ValidateTokenAsync(token, validationParameters);
    }
}
