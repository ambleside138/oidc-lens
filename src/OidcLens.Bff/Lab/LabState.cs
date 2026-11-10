using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace OidcLens.Bff.Lab;

internal sealed record LabLog(string StepId, string From, string To, string Kind, string Label,
    string Wire, DateTimeOffset RecordedAt);
internal sealed record LabSnapshot(string Id, string Phase, DateTimeOffset ExpiresAt,
    IReadOnlyList<LabLog> Logs, string? Error, string? NextRequest, string? ResourceMessage, string? PreviousTokenResponse,
    IReadOnlyDictionary<string, string>? Hosts);
internal sealed record LabStatus(bool Available, LabSnapshot? Attempt);
internal sealed record ExchangeInput(string Pkce);

internal sealed class LabAttempt(string owner, DateTimeOffset created)
{
    public string Id { get; } = Guid.NewGuid().ToString("N");
    public string Owner { get; } = owner;
    public DateTimeOffset ExpiresAt { get; } = created.AddMinutes(15);
    public SemaphoreSlim Gate { get; } = new(1, 1);
    private readonly object sync = new();
    private readonly List<LabLog> logs = [];
    public string Phase { get; set; } = "preparing";
    public string? Error { get; set; }
    public string? NextRequest { get; set; }
    public string? ResourceMessage { get; set; }
    public string? PreviousTokenResponse { get; set; }
    public IReadOnlyDictionary<string, string>? Hosts { get; set; }
    public string State { get; } = RandomValue();
    public string Nonce { get; } = RandomValue();
    public string Verifier { get; private set; } = RandomValue();
    public string Challenge => Microsoft.AspNetCore.WebUtilities.WebEncoders.Base64UrlEncode(
        SHA256.HashData(Encoding.ASCII.GetBytes(Verifier)));
    public string? AuthorizationEndpoint { get; set; }
    public string? TokenEndpoint { get; set; }
    public string? JwksUri { get; set; }
    public string? Code { get; set; }
    public string? AccessToken { get; set; }
    public string? IdToken { get; set; }
    public ClaimsPrincipal? Principal { get; set; }

    public void Add(TimeProvider clock, string step, string from, string to, string kind, string label, string wire)
    {
        lock (sync) logs.Add(new LabLog(step, from, to, kind, label, wire, clock.GetUtcNow()));
    }
    public LabSnapshot Snapshot()
    {
        lock (sync) return new(Id, Phase, ExpiresAt, logs.ToArray(), Error, NextRequest, ResourceMessage, PreviousTokenResponse, Hosts);
    }
    public void Fail(string message)
    {
        Phase = "failed";
        Error = message;
        NextRequest = null;
        Code = AccessToken = IdToken = null;
        Verifier = "";
        Principal = null;
    }
    public static string RandomValue() => Microsoft.AspNetCore.WebUtilities.WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
    public static string Alias(string kind, string? value) => value is null ? "[なし]"
        : $"[{kind}#{Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)))[..12]}]";
}

internal sealed class LabStore(TimeProvider clock)
{
    private readonly object sync = new();
    private readonly Dictionary<string, LabAttempt> attempts = [];
    public LabAttempt Start(string owner)
    {
        lock (sync)
        {
            foreach (var key in attempts.Where(pair => pair.Value.ExpiresAt <= clock.GetUtcNow()).Select(pair => pair.Key).ToArray())
                attempts.Remove(key);
            if (attempts.Count >= 128) attempts.Remove(attempts.Keys.First());
            var attempt = new LabAttempt(owner, clock.GetUtcNow())
            {
                PreviousTokenResponse = attempts.GetValueOrDefault(owner)?.Snapshot().Logs.LastOrDefault(log => log.StepId == "token" && log.Kind == "response")?.Wire
            };
            attempts[owner] = attempt;
            return attempt;
        }
    }
    public LabAttempt? Find(string? owner, string? id = null)
    {
        lock (sync)
        {
            if (owner is null || !attempts.TryGetValue(owner, out var attempt)) return null;
            if (attempt.ExpiresAt <= clock.GetUtcNow()) { attempts.Remove(owner); return null; }
            return id is null || id == attempt.Id ? attempt : null;
        }
    }
}
