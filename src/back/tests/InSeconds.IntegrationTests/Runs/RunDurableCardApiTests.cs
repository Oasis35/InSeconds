using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;
using InSeconds.IntegrationTests.Players;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Les cartes durables par HTTP (réglages par défaut) : la première manche se joue sans carte, une carte prise au palier agit toute seule sur chaque
/// morceau tant qu'on la garde, seul le Joker se joue, une carte ne se lâche qu'au palier. Le comportement des playlists d'avant est dans
/// <see cref="RunCardApiTests"/>.
/// </summary>
public class RunDurableCardApiTests(PostgresFixture postgres) : IAsyncLifetime
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

    /// <summary>Joue la manche 1, prend la carte offerte, choisit « Sûre » : rend la manche 2 commencée, avec ses effets.</summary>
    private static async Task<RunPlayResponse> TakeAndStartRoundTwoAsync(RunGamer alice, RunPlayResponse start, string card)
    {
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        await alice.PlayAsync(id, code, 1, AllFound);
        await alice.TakeCardAsync(id, 1, card);
        return await alice.ChooseAsync(id, 2, "safe");
    }

    [Fact]
    public async Task AuDepart_RienEnMain_PremiereMancheSansCarte_LesCartesSontDurables()
    {
        var (_, start) = await LaunchWithAsync("year");

        Assert.Empty(start.Session.Hand!);
        Assert.Null(start.Session.Offer);
        Assert.Null(start.Current!.Effects);
        Assert.True(start.Session.CardValues!.Durable);
        Assert.Equal((5m, 15, 10), (start.Session.CardValues.ExtendBonusSeconds, start.Session.CardValues.HourglassSeconds, start.Session.CardValues.LowerTargetPercent));
    }

    [Fact]
    public async Task Annee_AfficheeSansClic_SurChaqueMorceauTantQuOnLaGarde()
    {
        var (alice, start) = await LaunchWithAsync("year");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);

        var round2 = await TakeAndStartRoundTwoAsync(alice, start, "year");

        var track = await _run.TrackAtAsync(code, 6);
        Assert.Equal(1990 + track, round2.Current!.Effects!.Year);
        Assert.Equal(["year"], round2.Current.Effects.Cards);
        var next = await alice.AnswerAsync(id, code, 6);
        Assert.Equal(1990 + await _run.TrackAtAsync(code, 7), next.Current!.Effects!.Year);
        Assert.Equal([new RunHandCardResponse(1, "year")], next.Session.Hand);
    }

    [Fact]
    public async Task Initiales_Affichees_SansClic()
    {
        var (alice, start) = await LaunchWithAsync("initials");

        var round2 = await TakeAndStartRoundTwoAsync(alice, start, "initials");

        var track = (await _run.TrackAtAsync(start.Session.ChallengeCode, 6)).ToString(System.Globalization.CultureInfo.InvariantCulture)[..1];
        Assert.Equal(["A", track], round2.Current!.Effects!.ArtistInitials);
        Assert.Equal(["T", track], round2.Current.Effects.TitleInitials);
    }

    [Fact]
    public async Task Genre_LePremierGenreDeLAlbum_Affiche_SansGenreRienNEstAffiche()
    {
        await _run.Api.ExecuteAsync("INSERT INTO catalogue.genres (id, name) VALUES (7, 'Rock'), (8, 'Blues')");
        await _run.Api.ExecuteAsync("INSERT INTO catalogue.track_genres (track_id, genre_id) SELECT id, 7 FROM catalogue.tracks");
        await _run.Api.ExecuteAsync("INSERT INTO catalogue.track_genres (track_id, genre_id) SELECT id, 8 FROM catalogue.tracks");
        var (alice, start) = await LaunchWithAsync("genre");
        var round2 = await TakeAndStartRoundTwoAsync(alice, start, "genre");
        Assert.Equal("Blues", round2.Current!.Effects!.Genre);

        // Un morceau sans genre : la carte ne montre rien.
        var track = await _run.TrackAtAsync(start.Session.ChallengeCode, 7);
        await _run.Api.ExecuteAsync($"DELETE FROM catalogue.track_genres WHERE track_id = {track}");
        var next = await alice.AnswerAsync(start.Session.SessionId, start.Session.ChallengeCode, 6);

        Assert.Null(next.Current!.Effects!.Genre);
    }

    [Fact]
    public async Task QCM_TroisReponsesSurChaqueMorceau_UneSeuleJuste()
    {
        await _run.Game.App.AddPlayableTracksAsync(8, firstId: 29);
        var (alice, start) = await LaunchWithAsync("three_choices");

        var round2 = await TakeAndStartRoundTwoAsync(alice, start, "three_choices");

        var track = await _run.TrackAtAsync(start.Session.ChallengeCode, 6);
        var choices = round2.Current!.Effects!.Choices!;
        Assert.Equal(3, choices.Count);
        Assert.Single(choices, c => c == new RunChoiceResponse($"Artiste {track}", $"Titre {track}"));
        var next = await alice.AnswerAsync(start.Session.SessionId, start.Session.ChallengeCode, 6);
        Assert.Equal(3, next.Current!.Effects!.Choices!.Count);
    }

    [Fact]
    public async Task UneCarteDurable_NeSeJoueJamais_SeulLeJokerSeJoue()
    {
        var (alice, start) = await LaunchWithAsync("year");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        await TakeAndStartRoundTwoAsync(alice, start, "year");

        await GameAsserts.ProblemAsync(await alice.PlayCardRawAsync(id, 1, 6), HttpStatusCode.Conflict, RunsErrorCodes.CardUnavailable);

        var (joker, jokerStart) = await LaunchWithAsync("joker");
        var jokerId = jokerStart.Session.SessionId;
        await joker.PlayAsync(jokerId, jokerStart.Session.ChallengeCode, 1, AllFound);
        await joker.TakeCardAsync(jokerId, 1, "joker");
        await joker.ChooseAsync(jokerId, 2, "safe");
        var played = await joker.PlayCardAsync(jokerId, 1, 6);
        Assert.Empty(played.Session.Hand!);
        Assert.Equal(6, played.Current!.Position);
        Assert.Equal(code, start.Session.ChallengeCode);
    }

    [Fact]
    public async Task UneCarteNeSeLacheQuAuPalier_EtLaPlaceSeLibere()
    {
        var (alice, start) = await LaunchWithAsync("year", "extend");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        await TakeAndStartRoundTwoAsync(alice, start, "year");
        await GameAsserts.ProblemAsync(await alice.DropCardRawAsync(id, 1), HttpStatusCode.Conflict, RunsErrorCodes.OfferClosed);

        // Au palier suivant, l'offre propose une autre carte que celle en main : la carte se lâche.
        await alice.PlayAsync(id, code, 6, AllFound);
        Assert.Equal(HttpStatusCode.OK, (await alice.DropCardRawAsync(id, 1)).StatusCode);
        await GameAsserts.ProblemAsync(await alice.DropCardRawAsync(id, 1), HttpStatusCode.NotFound, RunsErrorCodes.CardNotFound);
    }

    [Fact]
    public async Task UneCarteDejaEnMain_NEstPasReproposeAuPalierSuivant()
    {
        var (alice, start) = await LaunchWithAsync("year", "extend");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        var first = (await alice.PlayAsync(id, code, 1, AllFound)).Session.Offer!.Cards;
        var taken = first[0];
        await alice.TakeCardAsync(id, 1, taken);
        await alice.ChooseAsync(id, 2, "safe");

        var second = (await alice.PlayAsync(id, code, 6, AllFound)).Session.Offer!.Cards;

        Assert.DoesNotContain(taken, second);
    }

    [Fact]
    public async Task Repechage_UnRateRapporteUnQuartDesPointsDuMorceau()
    {
        var (alice, start) = await LaunchWithAsync("net");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        await TakeAndStartRoundTwoAsync(alice, start, "net");

        var answer = await alice.AnswerAsync(id, code, 6, artist: false, title: false);

        // Manche 2 : ×1,33 ; la moitié de l'artiste seul (50 × 1,33 ÷ 2) arrondie.
        Assert.Equal((33, false, false), (answer.Revealed!.Points, answer.Revealed.ArtistCorrect, answer.Revealed.TitleCorrect));
    }

    [Fact]
    public async Task LUnOuLAutre_UnSeulDesDeuxSuffitPourLesPointsDuMorceauEntier()
    {
        var (alice, start) = await LaunchWithAsync("either_or");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        await TakeAndStartRoundTwoAsync(alice, start, "either_or");

        var answer = await alice.AnswerAsync(id, code, 6, artist: true, title: false);

        Assert.Equal((133, true, false), (answer.Revealed!.Points, answer.Revealed.ArtistCorrect, answer.Revealed.TitleCorrect));
    }

    [Fact]
    public async Task Rabais_BaisseLObjectifDeLaManche_Prolongation_AllongeLEcoute_Delai_AllongeLeChrono()
    {
        var (alice, start) = await LaunchWithAsync("lower_target");
        var lowered = await TakeAndStartRoundTwoAsync(alice, start, "lower_target");
        var withoutCard = await StartRoundTwoWithoutCardAsync();

        Assert.True(lowered.Session.Round!.Objective < withoutCard.Session.Round!.Objective);

        var (bob, bobStart) = await LaunchWithAsync("extend");
        var extended = await TakeAndStartRoundTwoAsync(bob, bobStart, "extend");
        Assert.Equal(withoutCard.Current!.ListenSeconds + 5m, extended.Current!.ListenSeconds);

        var (carol, carolStart) = await LaunchWithAsync("hourglass");
        await carol.Client.PostAsJsonAsync($"/api/runs/sessions/{carolStart.Session.SessionId}/clock", new StartRunClock(1), Ct);
        var hourglass = await TakeAndStartRoundTwoAsync(carol, carolStart, "hourglass");
        Assert.Equal(15, hourglass.Current!.Effects!.ClockBonusSeconds);
    }

    // Une manche 2 jouée sans carte (offre passée) : la référence des objectifs et de l'écoute.
    private async Task<RunPlayResponse> StartRoundTwoWithoutCardAsync()
    {
        var player = await _run.NewInvitedAsync($"Joueur{++_players}");
        var start = await player.LaunchAsync();
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        await player.PlayAsync(id, code, 1, AllFound);
        await player.PassOfferAsync(id, 1);
        return await player.ChooseAsync(id, 2, "safe");
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
