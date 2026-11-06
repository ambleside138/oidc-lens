namespace OidcLens.Bff.Tracing;

internal sealed record TraceStep(
    string Id,
    string Source,
    string From,
    string To,
    string? Method = null,
    string? Url = null,
    int? Status = null,
    IReadOnlyDictionary<string, string>? Request = null,
    IReadOnlyDictionary<string, string>? Response = null);

internal sealed record AttemptSummary(string Id, DateTimeOffset StartedAt);
internal sealed record AttemptDetails(string Id, DateTimeOffset StartedAt, IReadOnlyList<TraceStep> Steps);

internal sealed class AttemptHistory(TimeProvider clock)
{
    private const int MaxAttempts = 128;
    private const int MaxAttemptsPerBrowser = 8;
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);

    private readonly Lock gate = new();
    private readonly List<Attempt> attempts = [];

    public string Start(string owner)
    {
        lock (gate)
        {
            var now = clock.GetUtcNow();
            RemoveExpired(now);
            var owned = attempts.Where(attempt => attempt.Owner == owner).ToArray();
            if (owned.Length == MaxAttemptsPerBrowser)
                attempts.Remove(owned[0]);
            if (attempts.Count == MaxAttempts)
                attempts.RemoveAt(0);

            var id = Guid.NewGuid().ToString("N");
            attempts.Add(new Attempt(id, owner, now));
            return id;
        }
    }

    public IReadOnlyList<AttemptSummary> List(string owner)
    {
        lock (gate)
        {
            RemoveExpired(clock.GetUtcNow());
            return attempts.Where(attempt => attempt.Owner == owner).Reverse()
                .Select(attempt => new AttemptSummary(attempt.Id, attempt.StartedAt)).ToArray();
        }
    }

    public AttemptDetails? Find(string owner, string id)
    {
        lock (gate)
        {
            RemoveExpired(clock.GetUtcNow());
            var attempt = attempts.Find(attempt => attempt.Owner == owner && attempt.Id == id);
            return attempt is null ? null : new AttemptDetails(attempt.Id, attempt.StartedAt, attempt.Steps.ToArray());
        }
    }

    public void Record(string id, TraceStep step)
    {
        lock (gate)
        {
            RemoveExpired(clock.GetUtcNow());
            var attempt = attempts.Find(attempt => attempt.Id == id);
            if (attempt is null)
                return;

            var index = attempt.Steps.FindIndex(existing => existing.Id == step.Id);
            if (index < 0)
                attempt.Steps.Add(step);
            else
                attempt.Steps[index] = step;
        }
    }

    private void RemoveExpired(DateTimeOffset now) =>
        attempts.RemoveAll(attempt => now - attempt.StartedAt >= Lifetime);

    private sealed record Attempt(string Id, string Owner, DateTimeOffset StartedAt)
    {
        public List<TraceStep> Steps { get; } = [];
    }
}
