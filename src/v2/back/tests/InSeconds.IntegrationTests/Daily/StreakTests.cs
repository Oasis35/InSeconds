using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using InSeconds.IntegrationTests.Players;
using static InSeconds.IntegrationTests.Daily.DailyApi;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// La série et les gels (E2, § 5.4 du plan v2), mis à jour **dans la même transaction** que la fin de la partie. Toujours calculés sur la date
/// du défi, jamais sur le moment de la réponse (piège 18) ; les gels sont réservés aux comptes.
/// </summary>
public class StreakTests(PostgresFixture postgres) : IAsyncLifetime
{
    private GameApi _game = null!;

    public async ValueTask InitializeAsync()
    {
        _game = await GameApi.CreateAsync(await postgres.CreateDatabaseAsync());
        await _game.GenerateAsync();
    }

    public ValueTask DisposeAsync() => _game.DisposeAsync();

    [Fact]
    public async Task PremierePartieTerminee_CommenceLaSerieA1_SurLaDateDuDefi()
    {
        var alice = await _game.NewPlayerAsync();

        await PlayAsync(alice);

        Assert.Equal((1, Today), await StreakAsync(alice));
        var today = await alice.TodayAsync();
        Assert.Equal(("active", 1), (today.Streak.Status, today.Streak.Streak));
    }

    [Fact]
    public async Task PartieNonTerminee_NeToucheAPasLaSerie()
    {
        var alice = await _game.NewPlayerAsync();
        await _game.SetStreakAsync(alice.Id, 4, Today.AddDays(-1), 0);
        var session = (await alice.StartAsync()).SessionId;

        await alice.FinishAsync(session, count: 4);

        Assert.Equal((4, Today.AddDays(-1)), await StreakAsync(alice));
    }

    [Fact]
    public async Task JourSuivant_LaSerieMonte()
    {
        var alice = await _game.NewPlayerAsync();
        await _game.SetStreakAsync(alice.Id, 3, Today.AddDays(-1), 0);

        await PlayAsync(alice);

        Assert.Equal((4, Today), await StreakAsync(alice));
    }

    [Fact]
    public async Task JourManque_SansGel_LaSerieRepartA1()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.SetStreakAsync(alice.Id, 5, Today.AddDays(-2), 0);

        await PlayAsync(alice);

        Assert.Equal((1, Today), await StreakAsync(alice));
        Assert.Equal((0, false), await EffectAsync(alice));
    }

    [Fact]
    public async Task JourManque_Compte_UnGelSauveLaSerie()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.SetStreakAsync(alice.Id, 5, Today.AddDays(-2), 1);

        await PlayAsync(alice);

        // Le jour manqué consomme un gel : la série continue (elle ne monte pas pour ce jour-là).
        Assert.Equal((6, Today), await StreakAsync(alice));
        Assert.Equal(0, await FreezesAsync(alice));
        Assert.Equal((1, false), await EffectAsync(alice));
    }

    [Fact]
    public async Task PlusDeJoursManquesQueDeGels_LaSerieRepartA1_EtLesGelsRestent()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.SetStreakAsync(alice.Id, 5, Today.AddDays(-4), 2);

        await PlayAsync(alice);

        Assert.Equal((1, Today), await StreakAsync(alice));
        Assert.Equal(2, await FreezesAsync(alice));
        Assert.Equal((0, false), await EffectAsync(alice));
    }

    [Fact]
    public async Task Invite_NeConsommeJamaisDeGel()
    {
        var guest = await _game.NewPlayerAsync();
        await _game.SetStreakAsync(guest.Id, 5, Today.AddDays(-2), 1);

        await PlayAsync(guest);

        Assert.Equal((1, Today), await StreakAsync(guest));
        Assert.Equal((0, false), await EffectAsync(guest));
    }

    [Fact]
    public async Task ChaqueSeptJours_UnGelGagne_ParUnCompteSeulement_DansLaLimiteDuStock()
    {
        var linked = await _game.NewPlayerAsync("Alice");
        var guest = await _game.NewPlayerAsync();
        var full = await _game.NewPlayerAsync("Bob");
        await _game.SetStreakAsync(linked.Id, 6, Today.AddDays(-1), 0);
        await _game.SetStreakAsync(guest.Id, 6, Today.AddDays(-1), 0);
        await _game.SetStreakAsync(full.Id, 6, Today.AddDays(-1), 2);

        await PlayAsync(linked);
        await PlayAsync(guest);
        await PlayAsync(full);

        Assert.Equal((7, 1, true), ((await StreakAsync(linked)).Streak, await FreezesAsync(linked), (await EffectAsync(linked)).FreezeEarned));
        Assert.Equal((7, 0, false), ((await StreakAsync(guest)).Streak, await FreezesAsync(guest), (await EffectAsync(guest)).FreezeEarned));
        // Stock plein (2) : pas de gel de plus.
        Assert.Equal((7, 2, false), ((await StreakAsync(full)).Streak, await FreezesAsync(full), (await EffectAsync(full)).FreezeEarned));
    }

    [Fact]
    public async Task PartieDeLaVeilleTermineeApresMinuit_ContinueLaSerie_Piege18()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.SetStreakAsync(alice.Id, 3, Today.AddDays(-1), 0);
        var session = (await alice.StartAsync()).SessionId;
        await alice.FinishAsync(session, count: 3);

        // Minuit passe en pleine partie : le défi est celui d'hier, la série se calcule sur sa date.
        _game.Time.Advance(TimeSpan.FromHours(12.25));
        Assert.Equal("no_challenge", (await alice.TodayAsync()).State);
        var last = await alice.FinishAsync(session, fromPosition: 4);

        Assert.True(last.Completed);
        Assert.Equal((4, Today), await StreakAsync(alice));
    }

    // --- la série vue d'aujourd'hui (rien n'est écrit) ---

    [Fact]
    public async Task Aujourdhui_SerieProtegee_LeStockMontreLesGelsDejaEngages()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.SetStreakAsync(alice.Id, 5, Today.AddDays(-2), 2);

        var streak = (await alice.TodayAsync()).Streak;

        // Un jour manqué couvert par un des deux gels : il en reste un d'affiché, sans que la base ne change avant la partie.
        Assert.Equal(("protected", 5, 1, 1), (streak.Status, streak.Streak, streak.Freezes, streak.MissedDays));
        Assert.Equal(2, await FreezesAsync(alice));
    }

    [Fact]
    public async Task Aujourdhui_SerieCassee_ValeZero_EtLInviteEstAverti()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        var guest = await _game.NewPlayerAsync();
        await _game.SetStreakAsync(alice.Id, 5, Today.AddDays(-5), 1);
        await _game.SetStreakAsync(guest.Id, 4, Today.AddDays(-5), 0);

        var linked = (await alice.TodayAsync()).Streak;
        var anonymous = (await guest.TodayAsync()).Streak;

        Assert.Equal(("broken", 0, null), (linked.Status, linked.Streak, linked.LostStreak));
        // Un invité perd sa série : on lui dit combien (au-dessus du seuil de 2 jours).
        Assert.Equal(("broken", 0, 4, 0), (anonymous.Status, anonymous.Streak, anonymous.LostStreak, anonymous.MaxFreezes));
    }

    [Fact]
    public async Task Aujourdhui_ReglesDeGelLuesAChaud()
    {
        var alice = await _game.NewPlayerAsync("Alice");
        await _game.SetStreakAsync(alice.Id, 3, Today.AddDays(-1), 0);
        await _game.SetSettingAsync("Daily:StreakFreezeEveryDays", "5");
        await _game.SetSettingAsync("Daily:StreakFreezeMax", "3");

        var streak = (await alice.TodayAsync()).Streak;

        Assert.Equal((5, 3, 2), (streak.FreezeEveryDays, streak.MaxFreezes, streak.NextFreezeInDays));
    }

    // --- le gel offert à la création d'un compte ---

    [Fact]
    public async Task CreationDeCompte_OffreUnGel_DansLaTransactionDeLaCreation()
    {
        await using var app = MagicLinkApi.Create(await postgres.CreateDatabaseAsync(), recordGrants: false);

        var device = await app.SignInDeviceAsync("alice@example.com", "Alice");

        Assert.Equal(1, await app.Api.ScalarAsync<short>($"SELECT freezes FROM daily.streaks WHERE player_id = '{device.PlayerId}'"));
        // Une reconnexion n'en offre pas un second.
        await app.SignInDeviceAsync("alice@example.com");
        Assert.Equal(1, await app.Api.ScalarAsync<short>($"SELECT freezes FROM daily.streaks WHERE player_id = '{device.PlayerId}'"));
    }

    [Fact]
    public async Task ConversionDUnInvite_GardeSaSerie_EtGagneLeGelOffert()
    {
        await using var app = MagicLinkApi.Create(await postgres.CreateDatabaseAsync(), recordGrants: false);
        var browser = app.Browser();
        var guest = (await (await browser.PostAsync("/api/players/guest", null, Ct)).Content.ReadFromJsonAsync<InSeconds.Api.Modules.Players.Application.GuestResponse>(Ct))!.PlayerId;
        await app.Api.ExecuteAsync(
            $"INSERT INTO daily.streaks (player_id, current_streak, last_played_date, freezes) VALUES ('{guest}', 3, '{Today.AddDays(-1):yyyy-MM-dd}', 0)");

        var token = await app.RequestTokenAsync("carol@example.com", browser);
        (await MagicLinkApi.VerifyAsync(browser, token, "Carol")).EnsureSuccessStatusCode();

        // Le même joueur (l'invité converti) garde sa série et reçoit le gel.
        Assert.Equal((3, 1), (await app.Api.ScalarAsync<int>($"SELECT current_streak FROM daily.streaks WHERE player_id = '{guest}'"),
            await app.Api.ScalarAsync<short>($"SELECT freezes FROM daily.streaks WHERE player_id = '{guest}'")));
    }

    [Fact]
    public async Task CreationDeCompte_AvecDejaDeuxGels_EnGardeDeux()
    {
        await using var app = MagicLinkApi.Create(await postgres.CreateDatabaseAsync(), recordGrants: false);
        var browser = app.Browser();
        var guest = (await (await browser.PostAsync("/api/players/guest", null, Ct)).Content.ReadFromJsonAsync<InSeconds.Api.Modules.Players.Application.GuestResponse>(Ct))!.PlayerId;
        await app.Api.ExecuteAsync($"INSERT INTO daily.streaks (player_id, current_streak, freezes) VALUES ('{guest}', 0, 2)");

        var token = await app.RequestTokenAsync("dave@example.com", browser);
        (await MagicLinkApi.VerifyAsync(browser, token, "Dave")).EnsureSuccessStatusCode();

        Assert.Equal(2, await app.Api.ScalarAsync<short>($"SELECT freezes FROM daily.streaks WHERE player_id = '{guest}'"));
    }

    [Fact]
    public async Task SerieCreeeDeuxFoisEnMemeTemps_LaSecondeAttend_UneSeuleLigne_AucuneErreur()
    {
        // Le gel offert et la première complétion créent tous deux la ligne de série d'un joueur qui n'en a pas : sans verrou, les deux
        // l'insèrent et la seconde échoue sur la clé primaire (500).
        var player = await _game.NewPlayerAsync("Eve");
        async Task GrantAsync(int delayBeforeSaveMs)
        {
            using var scope = _game.Api.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<InSeconds.Api.Infrastructure.Persistence.InSecondsDbContext>();
            await using var transaction = await db.Database.BeginTransactionAsync(Ct);
            await new InSeconds.Api.Modules.Daily.Application.DailyStreakGrants(new InSeconds.Api.Modules.Daily.Persistence.EfDailyStore(db))
                .GrantAccountCreationFreezeAsync(player.Id, Ct);
            await Task.Delay(delayBeforeSaveMs, Ct);
            await db.SaveChangesAsync(Ct);
            await transaction.CommitAsync(Ct);
        }

        var first = GrantAsync(delayBeforeSaveMs: 700);
        await Task.Delay(150, Ct);
        var second = GrantAsync(delayBeforeSaveMs: 0);
        await Task.WhenAll(first, second);

        Assert.Equal(1L, await _game.Api.ScalarAsync<long>($"SELECT count(*) FROM daily.streaks WHERE player_id = '{player.Id}'"));
        Assert.Equal(1, await FreezesAsync(player));
    }

    // --- outils ---

    private static async Task PlayAsync(Gamer gamer) => await gamer.FinishAsync((await gamer.StartAsync()).SessionId);

    private async Task<(int Streak, DateOnly? LastPlayed)> StreakAsync(Gamer gamer) =>
        (await _game.Api.ScalarAsync<int>($"SELECT current_streak FROM daily.streaks WHERE player_id = '{gamer.Id}'"),
            await _game.Api.ScalarAsync<string>($"SELECT to_char(last_played_date, 'YYYY-MM-DD') FROM daily.streaks WHERE player_id = '{gamer.Id}'") is { } day
                ? DateOnly.Parse(day, System.Globalization.CultureInfo.InvariantCulture)
                : null);

    private async Task<int> FreezesAsync(Gamer gamer) =>
        await _game.Api.ScalarAsync<short>($"SELECT freezes FROM daily.streaks WHERE player_id = '{gamer.Id}'");

    /// <summary>Ce que la dernière partie du joueur a changé aux gels : gels consommés, gel gagné.</summary>
    private async Task<(int FreezesUsed, bool FreezeEarned)> EffectAsync(Gamer gamer) =>
        (await _game.Api.ScalarAsync<short>($"SELECT freezes_used FROM daily.sessions WHERE player_id = '{gamer.Id}'"),
            await _game.Api.ScalarAsync<bool>($"SELECT freeze_earned FROM daily.sessions WHERE player_id = '{gamer.Id}'"));

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
