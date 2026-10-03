using System.Security.Claims;
using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.UnitTests.Players;

public class DeviceSessionValidatorTests : IDisposable
{
    private static readonly DateTimeOffset Start = new(2026, 10, 3, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid PlayerId = Guid.Parse("0a1b2c3d-0000-4000-8000-000000000001");
    private const int SessionId = 7;

    private readonly FakeTimeProvider _time = new(Start);
    private readonly FakeSessions _sessions = new();
    private readonly DeviceSessionStatusCache _cache = new();

    public void Dispose() => _cache.Dispose();

    [Fact]
    public async Task AppareilActif_GardeLeJoueurEtSonAppareil()
    {
        _sessions.Status = new DeviceSessionStatus(IsActive: true, IsAdmin: false, LastSeenAt: Start);

        var principal = await ValidateAsync(Cookie());

        Assert.True(PlayerClaims.TryRead(principal, out var playerId, out var sessionId));
        Assert.Equal((PlayerId, SessionId), (playerId, sessionId));
        Assert.False(principal!.IsInRole(Roles.Admin));
    }

    [Fact]
    public async Task RoleAdmin_VientDeLaBase_JamaisDuCookie()
    {
        _sessions.Status = new DeviceSessionStatus(IsActive: true, IsAdmin: false, LastSeenAt: Start);

        // Un cookie qui porterait le rôle (renouvelé pendant qu'il était admin) ne le garde pas.
        var principal = await ValidateAsync(PlayerClaims.Create(PlayerId, SessionId, isAdmin: true));

        Assert.False(principal!.IsInRole(Roles.Admin));
    }

    [Fact]
    public async Task AppareilInactif_Rejete()
    {
        _sessions.Status = DeviceSessionStatus.Inactive;

        Assert.Null(await ValidateAsync(Cookie()));
    }

    [Fact]
    public async Task CookieSansJoueurNiAppareil_RejeteSansInterrogerLaBase()
    {
        Assert.Null(await ValidateAsync(new ClaimsPrincipal(new ClaimsIdentity([], AuthSetup.Scheme))));
        Assert.Equal(0, _sessions.StatusReads);
    }

    [Fact]
    public async Task Resultat_GardeUneMinute_PuisRelu()
    {
        _sessions.Status = new DeviceSessionStatus(IsActive: true, IsAdmin: false, LastSeenAt: Start);
        await ValidateAsync(Cookie());

        _sessions.Status = DeviceSessionStatus.Inactive;
        _time.Advance(TimeSpan.FromSeconds(59));
        Assert.NotNull(await ValidateAsync(Cookie()));
        Assert.Equal(1, _sessions.StatusReads);

        _time.Advance(TimeSpan.FromSeconds(1));
        Assert.Null(await ValidateAsync(Cookie()));
        Assert.Equal(2, _sessions.StatusReads);
    }

    [Fact]
    public async Task DerniereVisite_NoteeAuPlusToutesLes5Minutes()
    {
        _sessions.Status = new DeviceSessionStatus(IsActive: true, IsAdmin: false, LastSeenAt: Start);

        _time.Advance(TimeSpan.FromMinutes(4));
        await ValidateAsync(Cookie());
        Assert.Empty(_sessions.SeenAt);

        _time.Advance(TimeSpan.FromMinutes(1));
        await ValidateAsync(Cookie());
        Assert.Equal([Start.AddMinutes(5)], _sessions.SeenAt);

        // Déjà notée : pas de nouvelle écriture tant que 5 minutes ne sont pas passées.
        _time.Advance(TimeSpan.FromMinutes(2));
        await ValidateAsync(Cookie());
        Assert.Single(_sessions.SeenAt);
    }

    private Task<ClaimsPrincipal?> ValidateAsync(ClaimsPrincipal principal) =>
        new DeviceSessionValidator(_sessions, _cache, _time).ValidateAsync(principal, TestContext.Current.CancellationToken);

    private static ClaimsPrincipal Cookie() => PlayerClaims.Create(PlayerId, SessionId, isAdmin: false);

    private sealed class FakeSessions : IPlayerSessions
    {
        public DeviceSessionStatus Status { get; set; } = DeviceSessionStatus.Inactive;

        public int StatusReads { get; private set; }

        public List<DateTimeOffset> SeenAt { get; } = [];

        public Task<DeviceSessionStatus> GetStatusAsync(Guid playerId, int deviceSessionId, CancellationToken ct)
        {
            StatusReads++;
            return Task.FromResult(Status);
        }

        public Task RecordSeenAsync(Guid playerId, int deviceSessionId, DateTimeOffset now, CancellationToken ct)
        {
            SeenAt.Add(now);
            Status = Status with { LastSeenAt = now };
            return Task.CompletedTask;
        }

        public Task<OpenedDeviceSession?> OpenFromLegacyTokenAsync(Guid legacyAuthToken, DateTimeOffset now, string? userAgentLabel, CancellationToken ct) =>
            throw new NotSupportedException();
    }
}
