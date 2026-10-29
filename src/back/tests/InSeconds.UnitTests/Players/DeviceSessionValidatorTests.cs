using System.Security.Claims;
using InSeconds.Api.Infrastructure.Auth;
using InSeconds.Api.Modules.Players.Auth;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Time.Testing;

namespace InSeconds.UnitTests.Players;

public class DeviceSessionValidatorTests : IDisposable
{
    private static readonly DateTimeOffset Start = new(2026, 10, 3, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid PlayerId = Guid.Parse("0a1b2c3d-0000-4000-8000-000000000001");
    private const int SessionId = 7;

    private readonly FakeTimeProvider _time = new(Start);
    private readonly FakeSessions _sessions = new();
    private readonly HttpContextAccessor _httpContext = new();
    private readonly DeviceSessionStatusCache _cache;

    public DeviceSessionValidatorTests() => _cache = new DeviceSessionStatusCache(_httpContext);

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

    [Fact]
    public async Task RevocationPendantLaLecture_EtatLuPasGardeEnCache()
    {
        // La lecture voit encore l'appareil actif (révocation pas encore enregistrée) et la révocation oublie le cache
        // pendant ce temps : l'état lu sert à cette requête, la suivante relit la base.
        _sessions.Status = new DeviceSessionStatus(IsActive: true, IsAdmin: false, LastSeenAt: Start);
        _sessions.DuringRead = () =>
        {
            _cache.Forget(PlayerId, SessionId);
            _sessions.Status = DeviceSessionStatus.Inactive;
        };

        Assert.NotNull(await ValidateAsync(Cookie()));
        _sessions.DuringRead = null;

        Assert.Null(await ValidateAsync(Cookie()));
        Assert.Equal(2, _sessions.StatusReads);
    }

    [Fact]
    public async Task Revocation_OublieAussiAuDemarrageDeLaReponse_ApresLeCommit()
    {
        var response = new RecordingResponseFeature();
        var context = new DefaultHttpContext();
        context.Features.Set<IHttpResponseFeature>(response);
        _httpContext.HttpContext = context;

        _cache.Forget(PlayerId, SessionId);
        _httpContext.HttpContext = null;

        // Entre l'oubli et le commit, une requête concurrente lit encore l'appareil actif et le garde en cache.
        _sessions.Status = new DeviceSessionStatus(IsActive: true, IsAdmin: false, LastSeenAt: Start);
        Assert.NotNull(await ValidateAsync(Cookie()));

        // Le commit est fait, la réponse démarre : l'entrée est oubliée, la requête suivante voit la révocation.
        _sessions.Status = DeviceSessionStatus.Inactive;
        await response.StartAsync();
        Assert.Null(await ValidateAsync(Cookie()));
        Assert.Equal(2, _sessions.StatusReads);
    }

    [Fact]
    public void Revocation_HorsRequete_OublieToutDeSuite_SansErreur()
    {
        _cache.Forget(PlayerId, SessionId);

        Assert.Null(_cache.Get(PlayerId, SessionId));
    }

    private Task<ClaimsPrincipal?> ValidateAsync(ClaimsPrincipal principal) =>
        new DeviceSessionValidator(_sessions, _cache, _time).ValidateAsync(principal, TestContext.Current.CancellationToken);

    private static ClaimsPrincipal Cookie() => PlayerClaims.Create(PlayerId, SessionId, isAdmin: false);

    private sealed class FakeSessions : IPlayerSessions
    {
        public DeviceSessionStatus Status { get; set; } = DeviceSessionStatus.Inactive;

        public int StatusReads { get; private set; }

        public List<DateTimeOffset> SeenAt { get; } = [];

        /// <summary>Ce qui se passe ailleurs pendant la lecture en base (l'état rendu est celui d'avant).</summary>
        public Action? DuringRead { get; set; }

        public Task<DeviceSessionStatus> GetStatusAsync(Guid playerId, int deviceSessionId, CancellationToken ct)
        {
            StatusReads++;
            var status = Status;
            DuringRead?.Invoke();
            return Task.FromResult(status);
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

    /// <summary>Garde les rappels « au démarrage de la réponse » pour les lancer quand le test le décide.</summary>
    private sealed class RecordingResponseFeature : HttpResponseFeature
    {
        private readonly List<(Func<object, Task> Callback, object State)> _onStarting = [];

        public override void OnStarting(Func<object, Task> callback, object state) => _onStarting.Add((callback, state));

        public async Task StartAsync()
        {
            foreach (var (callback, state) in _onStarting)
                await callback(state);
        }
    }
}
