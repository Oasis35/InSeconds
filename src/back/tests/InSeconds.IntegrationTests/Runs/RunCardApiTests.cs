using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using InSeconds.Api.Modules.Players.Application;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.IntegrationTests.Daily;
using InSeconds.IntegrationTests.Players;
using Microsoft.Extensions.DependencyInjection;

namespace InSeconds.IntegrationTests.Runs;

/// <summary>
/// Les coups de pouce par HTTP : la carte de départ, l'offre d'un palier, la main de deux, chaque carte jouée sur le morceau en cours et ce qu'elle
/// révèle (seulement pour lui, piège 31), le Joker qui change de morceau, les refus, et la copie des données. Chaque test règle les cartes possibles
/// (<c>Runs:Cards</c>) pour savoir lesquelles la playlist tire.
/// </summary>
public class RunCardApiTests(PostgresFixture postgres) : IAsyncLifetime
{
    private static readonly bool[] AllFound = [true, true, true, true, true];

    private readonly CapturingLoggerProvider _logs = new();
    private RunGame _run = null!;

    // 28 morceaux : des tranches de 7, donc 5 morceaux et 2 de réserve par manche ; année 1990 + identifiant.
    public async ValueTask InitializeAsync()
    {
        _run = await RunGame.CreateAsync(
            await postgres.CreateDatabaseAsync(), tracks: 28,
            configureServices: s => s.AddSingleton<Microsoft.Extensions.Logging.ILoggerProvider>(_logs));
        await _run.Api.ExecuteAsync("UPDATE catalogue.tracks SET release_year = 1990 + id");
    }

    public ValueTask DisposeAsync() => _run.DisposeAsync();

    private async Task<(RunGamer Alice, RunPlayResponse Start)> LaunchWithAsync(params string[] cards)
    {
        await _run.Game.SetSettingAsync("Runs:Cards", JsonSerializer.Serialize(cards));
        var alice = await _run.NewInvitedAsync("Alice");
        return (alice, await alice.LaunchAsync());
    }

    [Fact]
    public async Task AuDepart_UneCarteEnMain_PasDOffre()
    {
        var (_, start) = await LaunchWithAsync("year");

        Assert.Equal([new RunHandCardResponse(1, "year")], start.Session.Hand);
        Assert.Equal(2, start.Session.HandSize);
        Assert.Null(start.Session.Offer);
        Assert.Null(start.Current!.Effects);
    }

    [Fact]
    public async Task Annee_ServieALActivation_PourLeMorceauEnCoursSeulement()
    {
        var (alice, start) = await LaunchWithAsync("year");
        var id = start.Session.SessionId;
        var track = await _run.TrackAtAsync(start.Session.ChallengeCode, 1);

        var played = await alice.PlayCardAsync(id, 1, 1);

        Assert.Equal(1990 + track, played.Current!.Effects!.Year);
        Assert.Equal(["year"], played.Current.Effects.Cards);
        Assert.Empty(played.Session.Hand!);
        Assert.Equal(1, played.Current.Position);
        // Le morceau suivant ne reçoit rien de la carte.
        var next = await alice.AnswerAsync(id, start.Session.ChallengeCode, 1);
        Assert.Equal(2, next.Current!.Position);
        Assert.Null(next.Current.Effects);
    }

    [Fact]
    public async Task Initiales_DeLArtisteEtDuTitre()
    {
        var (alice, start) = await LaunchWithAsync("initials");
        var track = await _run.TrackAtAsync(start.Session.ChallengeCode, 1);

        var effects = (await alice.PlayCardAsync(start.Session.SessionId, 1, 1)).Current!.Effects!;

        Assert.Equal(["A", track.ToString(System.Globalization.CultureInfo.InvariantCulture)[..1]], effects.ArtistInitials);
        Assert.Equal(["T", track.ToString(System.Globalization.CultureInfo.InvariantCulture)[..1]], effects.TitleInitials);
    }

    [Fact]
    public async Task TroisChoix_UneSeuleJuste_LesAutresHorsDeLaPlaylist()
    {
        // 8 morceaux de plus, sans rang (la tranche la moins connue) : des tranches de 9, deux morceaux par tranche hors de la playlist.
        await _run.Game.App.AddPlayableTracksAsync(8, firstId: 29);
        var (alice, start) = await LaunchWithAsync("three_choices");
        var code = start.Session.ChallengeCode;
        var track = await _run.TrackAtAsync(code, 1);

        var choices = (await alice.PlayCardAsync(start.Session.SessionId, 1, 1)).Current!.Effects!.Choices!;

        Assert.Equal(3, choices.Count);
        Assert.Single(choices, c => c == new RunChoiceResponse($"Artiste {track}", $"Titre {track}"));
        var inPlaylist = await _run.Api.ScalarAsync<int[]>($"""
            SELECT array_agg(track_id) FROM (
              SELECT t.track_id FROM runs.challenge_tracks t JOIN runs.challenges c ON c.id = t.challenge_id WHERE c.code = '{code}'
              UNION SELECT r.track_id FROM runs.challenge_reserve_tracks r JOIN runs.challenges c ON c.id = r.challenge_id WHERE c.code = '{code}') x
            """);
        Assert.All(choices.Where(c => c.Artist != $"Artiste {track}"),
            c => Assert.DoesNotContain(int.Parse(c.Artist["Artiste ".Length..], System.Globalization.CultureInfo.InvariantCulture), inPlaylist!));
    }

    [Fact]
    public async Task Joker_ChangeDeMorceau_LaReponseSeCorrigeSurLeNouveau()
    {
        var (alice, start) = await LaunchWithAsync("joker");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        var first = await _run.TrackAtAsync(code, 1);

        var played = await alice.PlayCardAsync(id, 1, 1);

        var replacement = await _run.Api.ScalarAsync<int>($"SELECT replacement_track_id FROM runs.session_cards WHERE session_id = {id} AND slot = 1");
        Assert.NotEqual(first, replacement);
        Assert.Equal(1, played.Current!.Position);
        Assert.NotNull(played.Current.PreviewUrl);
        var answer = await alice.AnswerRawAsync(id, 1, $"Artiste {replacement}", $"Titre {replacement}");
        var revealed = (await answer.Content.ReadFromJsonAsync<RunPlayResponse>(Ct))!.Revealed!;
        Assert.Equal((100, $"Artiste {replacement}", 1000L + replacement), (revealed.Points, revealed.Artist, revealed.DeezerTrackId));
    }

    [Fact]
    public async Task Filet_UnMorceauRateRapporteLaMoitie()
    {
        var (alice, start) = await LaunchWithAsync("net");
        var id = start.Session.SessionId;

        await alice.PlayCardAsync(id, 1, 1);
        var answer = await alice.AnswerAsync(id, start.Session.ChallengeCode, 1, artist: false, title: false);

        Assert.Equal((50, false, false), (answer.Revealed!.Points, answer.Revealed.ArtistCorrect, answer.Revealed.TitleCorrect));
    }

    [Fact]
    public async Task SeuilAbaisse_LObjectifDeLaMancheBaisse()
    {
        var (alice, start) = await LaunchWithAsync("lower_target");

        var played = await alice.PlayCardAsync(start.Session.SessionId, 1, 1);

        Assert.Equal((225, 180), (start.Session.Round!.Objective, played.Session.Round!.Objective));
    }

    [Fact]
    public async Task Rallonge_EcouteDeVingtSecondes()
    {
        var (alice, start) = await LaunchWithAsync("extend");
        var id = start.Session.SessionId;
        await GameAsserts.ProblemAsync(await alice.ListenRawAsync(id, 1, 15m), HttpStatusCode.BadRequest, "common.bad_request");

        var played = await alice.PlayCardAsync(id, 1, 1);

        Assert.Equal(20m, played.Current!.ListenSeconds);
        Assert.Equal(HttpStatusCode.NoContent, (await alice.ListenRawAsync(id, 1, 15m)).StatusCode);
    }

    [Fact]
    public async Task Sablier_TrenteSecondesDePlusAuChrono()
    {
        var (alice, start) = await LaunchWithAsync("hourglass");
        var id = start.Session.SessionId;
        await alice.Client.PostAsJsonAsync($"/api/runs/sessions/{id}/clock", new StartRunClock(1), Ct);

        var played = await alice.PlayCardAsync(id, 1, 1);

        Assert.Equal(30, played.Current!.Effects!.ClockBonusSeconds);
        Assert.Equal(75m, played.Session.ClockRemainingSeconds);
    }

    [Fact]
    public async Task AuPalier_LOffreSePrend_PuisMainPleine_LaCarteLacheeEnEchange()
    {
        var (alice, start) = await LaunchWithAsync("year");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        var end = await alice.PlayAsync(id, code, 1, AllFound);
        Assert.Equal(1, end.Session.Offer!.AfterRound);
        Assert.Equal(["year"], end.Session.Offer.Cards);

        var taken = await alice.TakeCardAsync(id, 1, "year");
        Assert.Equal([1, 2], taken.Hand!.Select(c => c.Slot));
        Assert.Null(taken.Offer);
        await GameAsserts.ProblemAsync(await alice.TakeCardRawAsync(id, 1, "year"), HttpStatusCode.Conflict, RunsErrorCodes.OfferClosed);

        await alice.ChooseAsync(id, 2, "safe");
        await alice.PlayAsync(id, code, 6, AllFound);
        await GameAsserts.ProblemAsync(await alice.TakeCardRawAsync(id, 2, "year"), HttpStatusCode.Conflict, RunsErrorCodes.HandFull);
        await GameAsserts.ProblemAsync(await alice.TakeCardRawAsync(id, 2, "year", dropSlot: 9), HttpStatusCode.NotFound, RunsErrorCodes.CardNotFound);
        var swapped = await alice.TakeCardAsync(id, 2, "year", dropSlot: 1);
        Assert.Equal([2, 3], swapped.Hand!.Select(c => c.Slot));
    }

    [Fact]
    public async Task LOffre_SeFermeQuandLaMancheCommence()
    {
        var (alice, start) = await LaunchWithAsync("year");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        await alice.PlayAsync(id, code, 1, AllFound);
        await alice.ChooseAsync(id, 2, "safe");

        Assert.Equal(HttpStatusCode.NoContent, (await alice.ListenRawAsync(id, 6, 2m)).StatusCode);

        await GameAsserts.ProblemAsync(await alice.TakeCardRawAsync(id, 1, "year"), HttpStatusCode.Conflict, RunsErrorCodes.OfferClosed);
        Assert.Null((await alice.SessionAsync(id)).Offer);
    }

    [Fact]
    public async Task LesRefus_CarteAbsente_DejaActive_AutreMorceau()
    {
        var (alice, start) = await LaunchWithAsync("year");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);

        await GameAsserts.ProblemAsync(await alice.PlayCardRawAsync(id, 9, 1), HttpStatusCode.NotFound, RunsErrorCodes.CardNotFound);
        await GameAsserts.ProblemAsync(await alice.PlayCardRawAsync(id, 1, 2), HttpStatusCode.Conflict, RunsErrorCodes.TrackLockNotReleased);
        await alice.PlayAsync(id, code, 1, AllFound);
        await alice.TakeCardAsync(id, 1, "year");
        await alice.ChooseAsync(id, 2, "safe");
        await alice.PlayCardAsync(id, 1, 6);
        await GameAsserts.ProblemAsync(await alice.PlayCardRawAsync(id, 2, 6), HttpStatusCode.Conflict, RunsErrorCodes.CardAlreadyActive);

        Assert.Equal(HttpStatusCode.OK, (await alice.DropCardRawAsync(id, 2)).StatusCode);
        await GameAsserts.ProblemAsync(await alice.DropCardRawAsync(id, 2), HttpStatusCode.NotFound, RunsErrorCodes.CardNotFound);
    }

    [Fact]
    public async Task LaReprise_RendLesEffetsDuMorceauEnCours()
    {
        var (alice, start) = await LaunchWithAsync("year");

        await alice.PlayCardAsync(start.Session.SessionId, 1, 1);
        var resumed = await alice.JoinAsync(start.Session.ChallengeCode);

        Assert.NotNull(resumed.Current!.Effects!.Year);
    }

    [Fact]
    public async Task TroisChoix_LesLeurresSontFigesALaCarteJouee_MemeSiLeCatalogueChange()
    {
        await _run.Game.App.AddPlayableTracksAsync(8, firstId: 29);
        var (alice, start) = await LaunchWithAsync("three_choices");
        var played = (await alice.PlayCardAsync(start.Session.SessionId, 1, 1)).Current!.Effects!.Choices!;

        await _run.Game.App.AddPlayableTracksAsync(8, firstId: 37);
        await _run.Api.ExecuteAsync("UPDATE catalogue.tracks SET disabled_at = now() WHERE id BETWEEN 29 AND 32");
        var resumed = (await alice.JoinAsync(start.Session.ChallengeCode)).Current!.Effects!.Choices!;

        Assert.Equal(played, resumed);
    }

    [Fact]
    public async Task Annee_SansAnneeConnue_409_LaCarteResteEnMain()
    {
        var (alice, start) = await LaunchWithAsync("year");
        await _run.Api.ExecuteAsync($"UPDATE catalogue.tracks SET release_year = NULL WHERE id = {await _run.TrackAtAsync(start.Session.ChallengeCode, 1)}");

        await GameAsserts.ProblemAsync(await alice.PlayCardRawAsync(start.Session.SessionId, 1, 1), HttpStatusCode.Conflict, RunsErrorCodes.CardUnavailable);
        Assert.Single((await alice.SessionAsync(start.Session.SessionId)).Hand!);
    }

    [Fact]
    public async Task CartesCoupees_AucuneCarteNiMain()
    {
        await _run.Game.SetSettingAsync("Runs:CardsEnabled", "false");
        var alice = await _run.NewInvitedAsync("Alice");

        var start = await alice.LaunchAsync();

        Assert.Empty(start.Session.Hand!);
        Assert.Equal(0, start.Session.HandSize);
    }

    [Fact]
    public async Task PrendreEtJouer_SontJournalises_SansPseudo()
    {
        var (alice, start) = await LaunchWithAsync("year");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);

        await alice.PlayCardAsync(id, 1, 1);
        await alice.PlayAsync(id, code, 1, AllFound);
        await alice.TakeCardAsync(id, 1, "year");

        var played = Assert.Single(_logs.Messages, m => m.Contains("carte year jouée sur le morceau n°1", StringComparison.Ordinal));
        var taken = Assert.Single(_logs.Messages, m => m.Contains("carte year prise au palier de la manche 1", StringComparison.Ordinal));
        Assert.All([played, taken], m => Assert.Contains($"Partie {id} de {alice.Id}", m, StringComparison.Ordinal));
        Assert.All([played, taken], m => Assert.DoesNotContain("Alice", m, StringComparison.Ordinal));
    }

    [Fact]
    public async Task LEffacement_EmporteLesCartes_MemeEnMain()
    {
        var (alice, _) = await LaunchWithAsync("year");
        Assert.Equal(1L, await _run.Api.ScalarAsync<long>("SELECT count(*) FROM runs.session_cards"));

        var response = await alice.Client.PostAsJsonAsync("/api/players/me/delete", new DeleteMyAccount("Alice"), Ct);

        response.EnsureSuccessStatusCode();
        Assert.Equal(0L, await _run.Api.ScalarAsync<long>("SELECT count(*) FROM runs.session_cards"));
    }

    [Fact]
    public async Task LaCopieDesDonnees_DitLeMorceauJoueParUnJoker()
    {
        var (alice, start) = await LaunchWithAsync("joker");
        var id = start.Session.SessionId;
        await alice.PlayCardAsync(id, 1, 1);
        var replacement = await _run.Api.ScalarAsync<int>($"SELECT replacement_track_id FROM runs.session_cards WHERE session_id = {id}");

        var export = (await alice.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!;

        var card = Assert.Single(Assert.Single(ExportReading.Section<RunsDataExport>(export, "runs").Games).Cards);
        Assert.Equal(("joker", 1, 1, 1000L + replacement), (card.Card, card.PlayedRound, card.PlayOrder, card.ReplacementDeezerTrackId));
    }

    [Fact]
    public async Task LeDisqueVise_ParLaMancheEnCours()
    {
        var (alice, start) = await LaunchWithAsync("year");
        Assert.Equal(new RunDiscResponse("runs.discs.wax", 0), start.Session.NextDisc);

        var end = await alice.PlayAsync(start.Session.SessionId, start.Session.ChallengeCode, 1, AllFound);

        Assert.Equal(new RunDiscResponse("runs.discs.bronze", 0), end.Session.NextDisc);
    }

    [Fact]
    public async Task ChoisirLaDifficulte_FermeLOffre()
    {
        var (alice, start) = await LaunchWithAsync("year");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        await alice.PlayAsync(id, code, 1, AllFound);

        await alice.ChooseAsync(id, 2, "risky");

        await GameAsserts.ProblemAsync(await alice.TakeCardRawAsync(id, 1, "year"), HttpStatusCode.Conflict, RunsErrorCodes.OfferClosed);
    }

    [Fact]
    public async Task SansChoixDeDifficulte_RienNePartTantQueLOffreEstOuverte_NiQuandOnLaPasse()
    {
        await _run.Game.SetSettingAsync("Runs:Difficulties", """[{"difficulty":"safe","pointsFactor":1,"objectiveFactor":1}]""");
        var (alice, start) = await LaunchWithAsync("year");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);

        var end = await alice.PlayAsync(id, code, 1, AllFound);
        Assert.Null(end.Current);
        Assert.Null(end.Session.DifficultyChoice);
        Assert.Equal(1, end.Session.Offer!.AfterRound);

        // Passer garde le joueur au palier : rien n'est servi (le chrono partirait), le morceau se demande à « Suite ».
        var passed = await alice.PassOfferAsync(id, 1);
        Assert.Null(passed.Offer);
        Assert.Equal(0L, await _run.Api.ScalarAsync<long>($"SELECT count(*) FROM runs.sessions WHERE id = {id} AND current_served_at IS NOT NULL"));

        var served = await alice.PreviewAsync(id);
        Assert.Equal(6, served.Current!.Position);
        Assert.NotNull(served.Current.PreviewUrl);
        await GameAsserts.ProblemAsync(await alice.PassOfferRawAsync(id, 1), HttpStatusCode.Conflict, RunsErrorCodes.OfferClosed);
    }

    [Fact]
    public async Task SablierSansChrono_409_CardUnavailable()
    {
        await _run.Game.SetSettingAsync("Runs:AnswerSeconds", "0");
        var (alice, start) = await LaunchWithAsync("hourglass");

        await GameAsserts.ProblemAsync(await alice.PlayCardRawAsync(start.Session.SessionId, 1, 1), HttpStatusCode.Conflict, RunsErrorCodes.CardUnavailable);
    }

    [Fact]
    public async Task TroisChoix_SansLeurresDansLeCatalogue_409()
    {
        // Les 28 morceaux du catalogue sont tous dans la playlist (réserve comprise) : aucun leurre possible.
        var (alice, start) = await LaunchWithAsync("three_choices");

        await GameAsserts.ProblemAsync(await alice.PlayCardRawAsync(start.Session.SessionId, 1, 1), HttpStatusCode.Conflict, RunsErrorCodes.CardUnavailable);
    }

    [Fact]
    public async Task UnePlaylistSansCartes_NiMainNiOffre()
    {
        var (alice, start) = await LaunchWithAsync("year");
        var (id, code) = (start.Session.SessionId, start.Session.ChallengeCode);
        // Les règles d'une playlist créée avant les coups de pouce, et une partie sans carte.
        await _run.Api.ExecuteAsync($$"""
            UPDATE runs.challenges SET rules = rules - 'cards' WHERE code = '{{code}}';
            DELETE FROM runs.session_cards WHERE session_id = {{id}};
            """);

        var end = await alice.PlayAsync(id, code, 1, AllFound);

        Assert.Equal((0, null), (end.Session.HandSize, end.Session.Offer));
        Assert.Empty(end.Session.Hand!);
        await GameAsserts.ProblemAsync(await alice.TakeCardRawAsync(id, 1, "year"), HttpStatusCode.Conflict, RunsErrorCodes.OfferClosed);
    }

    [Fact]
    public async Task LaCopieDesDonnees_DonneLesCartes()
    {
        var (alice, start) = await LaunchWithAsync("year");
        await alice.PlayCardAsync(start.Session.SessionId, 1, 1);

        var export = (await alice.Client.GetFromJsonAsync<PlayerDataExport>("/api/players/me/export", Ct))!;

        var card = Assert.Single(Assert.Single(ExportReading.Section<RunsDataExport>(export, "runs").Games).Cards);
        Assert.Equal(("year", 0, 1), (card.Card, card.AcquiredRound, card.PlayedPosition));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;
}
