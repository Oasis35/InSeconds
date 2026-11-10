using System.Net;
using System.Text.Json;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;
using InSeconds.IntegrationTests.Players;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Les coups de pouce par HTTP, avec les réglages par défaut : l'Échange (un par manche, qui ne se garde pas) et la carte qu'une manche franchie à
/// plus de 125 % de son objectif offre pour la suivante (une seule, usée à la fin de cette manche).
/// </summary>
public class RunSwapAndRewardApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly bool[] AllFound = [true, true, true, true, true];

    private RunGame _run = null!;
    private int _players;

    // 28 morceaux : des tranches de 7, donc 5 morceaux et 2 de réserve par manche ; année 1990 + identifiant.
    public async ValueTask InitializeAsync()
    {
        _run = await RunGame.CreateAsync(await postgres.CreateDatabaseAsync(), tracks: 28);
        await _run.Api.ExecuteAsync("UPDATE catalogue.tracks SET release_year = 1990 + id");
    }

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    private async Task<(RunGamer Alice, RunPlayResponse Start)> LaunchWithAsync(params string[] cards)
    {
        await _run.Game.SetSettingAsync("Runs:Cards", JsonSerializer.Serialize(cards));
        var alice = await _run.NewInvitedAsync($"Joueur{++_players}");
        return (alice, await alice.LaunchAsync());
    }

    private Microsoft.Extensions.Diagnostics.Metrics.Testing.MetricCollector<long> Collect(string instrument) =>
        new(_run.Api.Services.GetRequiredService<System.Diagnostics.Metrics.IMeterFactory>(), RunsMetrics.MeterName, instrument);

    private static string? Tag(Microsoft.Extensions.Diagnostics.Metrics.Testing.CollectedMeasurement<long> m, string key) =>
        m.Tags.TryGetValue(key, out var value) ? Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) : null;

    /// <summary>Joue la manche 1 (tout trouvé), rend le résultat du dernier morceau.</summary>
    private static Task<RunPlayResponse> PlayRoundOneAsync(RunGamer alice, RunPlayResponse start) =>
        alice.PlayAsync(start.Session.SessionId, start.Session.ChallengeCode, 1, AllFound);

    [Fact]
    public async Task AuDepart_AucuneCarte_UnEchangeOffert_EtLesValeursDeLaPlaylist()
    {
        var (_, start) = await LaunchWithAsync("hint");

        Assert.Empty(start.Session.Hand!);
        Assert.True(start.Session.SwapAvailable);
        Assert.Null(start.Current!.Effects);
        Assert.Equal(new RunCardValuesResponse(5m, 25), start.Session.CardValues);
    }

    [Fact]
    public async Task LEchange_ChangeLeMorceau_ParLeSuivantDeLaReserve_UnSeulParManche()
    {
        var (alice, start) = await LaunchWithAsync("hint");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        var reserve = await _run.Api.ScalarAsync<int>(
            $"SELECT r.track_id FROM runs.challenge_reserve_tracks r JOIN runs.challenges c ON c.id = r.challenge_id WHERE c.code = '{code}' AND r.round = 1 AND r.rank = 1");

        var swapped = await alice.SwapAsync(id, 1);

        Assert.Equal(1, swapped.Current!.Position);
        Assert.NotNull(swapped.Current.PreviewUrl);
        Assert.False(swapped.Session.SwapAvailable);
        Assert.Empty(swapped.Session.Hand!);
        var again = await alice.SwapRawAsync(id, 1);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Contains(RunsErrorCodes.SwapUnavailable, await again.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        // La réponse porte sur le morceau mis à la place.
        var answer = await alice.AnswerRawAsync(id, 1, $"Artiste {reserve}", $"Titre {reserve}");
        Assert.True(answer.IsSuccessStatusCode);
        Assert.Equal(1L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.session_cards WHERE session_id = {id} AND card = 2 AND replacement_track_id = {reserve}"));
    }

    [Fact]
    public async Task LEchange_RevientALaMancheSuivante_MaisPasTantQueLaDifficulteResteAChoisir()
    {
        var (alice, start) = await LaunchWithAsync("hint");
        var id = start.Session.SessionId;
        await alice.SwapAsync(id, 1);
        await PlayRoundOneAsync(alice, start);

        // Le premier morceau de la manche 2 n'est pas encore parti : rien à changer.
        var early = await alice.SwapRawAsync(id, 6);
        Assert.Equal(HttpStatusCode.Conflict, early.StatusCode);
        var chosen = await alice.ChooseAsync(id, 2, "safe");
        Assert.True(chosen.Session.SwapAvailable);

        var swapped = await alice.SwapAsync(id, 6);

        Assert.False(swapped.Session.SwapAvailable);
        Assert.Equal(2L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.session_cards WHERE session_id = {id} AND card = 2"));
    }

    [Fact]
    public async Task LEchange_RefuseSurUnAutreMorceauQueLeMorceauEnCours()
    {
        var (alice, start) = await LaunchWithAsync("hint");

        var other = await alice.SwapRawAsync(start.Session.SessionId, 3);

        Assert.Equal(HttpStatusCode.Conflict, other.StatusCode);
    }

    [Fact]
    public async Task UneMancheTresReussie_OffreLaCarte_Indice_QuiAideToutesLesMorceauxDeLaSuivante()
    {
        var (alice, start) = await LaunchWithAsync("hint");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);

        var last = await PlayRoundOneAsync(alice, start);

        Assert.Equal("hint", Assert.Single(last.RoundSummaries).RewardCard);
        Assert.Equal([new RunHandCardResponse(1, "hint")], last.Session.Hand);
        var round2 = await alice.ChooseAsync(id, 2, "safe");
        var track = await _run.TrackAtAsync(code, 6);
        var effects = round2.Current!.Effects!;
        Assert.Equal(["hint"], effects.Cards);
        Assert.Equal(1990 + track, effects.Year);
        Assert.Equal(["A", track.ToString(System.Globalization.CultureInfo.InvariantCulture)[..1]], effects.ArtistInitials);
        // Le morceau suivant de la manche est aidé aussi.
        var next = await alice.AnswerAsync(id, code, 6);
        Assert.Equal(1990 + await _run.TrackAtAsync(code, 7), next.Current!.Effects!.Year);
    }

    [Fact]
    public async Task Indice_SansGenre_NeMontreQueLAnneeEtLesInitiales_AvecUnGenre_LePremierParOrdreAlphabetique()
    {
        await _run.Api.ExecuteAsync("INSERT INTO catalogue.genres (id, name) VALUES (7, 'Rock'), (8, 'Blues')");
        var (alice, start) = await LaunchWithAsync("hint");
        var id = start.Session.SessionId;
        await PlayRoundOneAsync(alice, start);
        var round2 = await alice.ChooseAsync(id, 2, "safe");
        Assert.Null(round2.Current!.Effects!.Genre);

        await _run.Api.ExecuteAsync("INSERT INTO catalogue.track_genres (track_id, genre_id) SELECT id, 7 FROM catalogue.tracks");
        await _run.Api.ExecuteAsync("INSERT INTO catalogue.track_genres (track_id, genre_id) SELECT id, 8 FROM catalogue.tracks");
        var next = await alice.AnswerAsync(id, start.Session.ChallengeCode, 6);

        Assert.Equal("Blues", next.Current!.Effects!.Genre);
        Assert.NotNull(next.Current.Effects.Year);
    }

    [Fact]
    public async Task Prolongation_CinqSecondesDEcouteDeLaManche_QCM_TroisReponses()
    {
        await _run.Game.App.AddPlayableTracksAsync(8, firstId: 29);
        var (alice, start) = await LaunchWithAsync("extend");
        await PlayRoundOneAsync(alice, start);
        var round2 = await alice.ChooseAsync(start.Session.SessionId, 2, "safe");
        Assert.Equal(15m, round2.Current!.ListenSeconds);

        var (bob, bobStart) = await LaunchWithAsync("three_choices");
        await PlayRoundOneAsync(bob, bobStart);
        var bobRound2 = await bob.ChooseAsync(bobStart.Session.SessionId, 2, "safe");
        var track = await _run.TrackAtAsync(bobStart.Session.ChallengeCode, 6);
        var choices = bobRound2.Current!.Effects!.Choices!;
        Assert.Equal(3, choices.Count);
        Assert.Single(choices, c => c == new RunChoiceResponse($"Artiste {track}", $"Titre {track}"));
    }

    [Fact]
    public async Task UneMancheJusteFranchie_NOffreRien_EtLaCarteDeLAncienneMancheSUse()
    {
        var (alice, start) = await LaunchWithAsync("hint");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        RunPlayResponse? last = null;
        // Artiste seul : 50 % du maximum pour un objectif de 45 %, soit 111 % : passée sans carte.
        for (var position = 1; position <= 5; position++)
            last = await alice.AnswerAsync(id, code, position, artist: true, title: false);
        Assert.Null(Assert.Single(last!.RoundSummaries).RewardCard);
        Assert.Empty(last.Session.Hand!);

        // La manche 2 réussie à 60 % (objectif 55 %, 109 %) : ni carte gagnée, et rien à user.
        await alice.ChooseAsync(id, 2, "safe");
        for (var position = 6; position <= 10; position++)
            last = await alice.AnswerAsync(id, code, position, artist: position <= 8, title: position <= 8);
        Assert.Equal(2, last!.Session.RoundsPassed);
        Assert.Empty(last.Session.Hand!);
    }

    [Fact]
    public async Task LaCarte_ServSurLaMancheSuivante_PuisDisparait_UneSeuleALaFois()
    {
        var (alice, start) = await LaunchWithAsync("hint");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        await PlayRoundOneAsync(alice, start);
        await alice.ChooseAsync(id, 2, "safe");
        // La manche 2 réussie à 60 % : la carte de la manche 1 sert puis disparaît, aucune nouvelle.
        RunPlayResponse? last = null;
        for (var position = 6; position <= 10; position++)
            last = await alice.AnswerAsync(id, code, position, artist: position <= 8, title: position <= 8);

        Assert.Empty(last!.Session.Hand!);
        Assert.Equal(1L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.session_cards WHERE session_id = {id} AND dropped_at IS NOT NULL"));
        Assert.Null(last.Current?.Effects);
    }

    [Fact]
    public async Task Mesure_LaCarteGagnee_EtLEchange()
    {
        var (alice, start) = await LaunchWithAsync("hint");
        using var cards = Collect(RunsMetrics.CardsName);

        await alice.SwapAsync(start.Session.SessionId, 1);
        await PlayRoundOneAsync(alice, start);

        var measurements = cards.GetMeasurementSnapshot().Select(m => (Tag(m, "action"), Tag(m, "card"))).ToList();
        Assert.Equal([(RunsMetrics.SwappedAction, "swap"), (RunsMetrics.CardEarnedAction, "hint")], measurements);
    }

    [Fact]
    public async Task LeJoueurDUnAutre_NePeutPasChangerLeMorceau()
    {
        var (_, start) = await LaunchWithAsync("hint");
        var bob = await _run.NewInvitedAsync("Intrus");

        var response = await bob.SwapRawAsync(start.Session.SessionId, 1);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
