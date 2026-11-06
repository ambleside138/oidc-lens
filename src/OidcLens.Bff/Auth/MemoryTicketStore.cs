using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Caching.Memory;

namespace OidcLens.Bff.Auth;

internal sealed class MemoryTicketStore(IMemoryCache cache) : ITicketStore
{
    public async Task<string> StoreAsync(AuthenticationTicket ticket)
    {
        var key = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        await RenewAsync(key, ticket);
        return key;
    }

    public Task RenewAsync(string key, AuthenticationTicket ticket)
    {
        cache.Set(key, TicketSerializer.Default.Serialize(ticket), ticket.Properties.ExpiresUtc!.Value);
        return Task.CompletedTask;
    }

    public Task<AuthenticationTicket?> RetrieveAsync(string key)
    {
        var ticket = cache.TryGetValue<byte[]>(key, out var bytes)
            ? TicketSerializer.Default.Deserialize(bytes!)
            : null;
        return Task.FromResult(ticket);
    }

    public Task RemoveAsync(string key)
    {
        cache.Remove(key);
        return Task.CompletedTask;
    }
}
