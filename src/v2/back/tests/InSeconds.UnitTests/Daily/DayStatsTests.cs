using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.UnitTests.Daily;

public class DayStatsTests
{
    private static readonly DateOnly Day = new(2026, 10, 3);
    private static readonly decimal[] Steps = [0.5m, 1m, 1.5m, 2m, 3m, 5m, 10m];

    // --- la répartition des scores ---

    [Fact]
    public void Repartition_DixTranchesDeMemeLargeur_ComptesANulCompris()
    {
        var buckets = ScoreDistribution.Build([0, 499, 500, 5000], maxPossibleScore: 5000);

        Assert.Equal(10, buckets.Count);
        Assert.Equal((0, 499, 2), (buckets[0].MinScore, buckets[0].MaxScore, buckets[0].Count));
        Assert.Equal((500, 999, 1), (buckets[1].MinScore, buckets[1].MaxScore, buckets[1].Count));
        // La dernière tranche finit au score maximal possible.
        Assert.Equal((4500, 5000, 1), (buckets[9].MinScore, buckets[9].MaxScore, buckets[9].Count));
        Assert.Equal(4, buckets.Sum(b => b.Count));
    }

    [Fact]
    public void Repartition_UnScoreAuDessusDuMaximum_TombeDansLaDerniereTranche()
    {
        // Le barème a changé en cours de journée : un score plus haut que le maximum d'aujourd'hui ne sort pas du tableau.
        Assert.Equal(1, ScoreDistribution.Build([9999], 5000)[9].Count);
    }

    [Fact]
    public void Repartition_SansMaximum_Vide() => Assert.Empty(ScoreDistribution.Build([100], 0));

    [Fact]
    public void Repartition_LargeurArrondieAuDessus_QuandLaDivisionNeTombePasJuste()
    {
        // 4251 / 10 = 425,1 : la largeur est 426, et les trois petits scores tombent dans la première tranche.
        var buckets = ScoreDistribution.Build([1, 2, 3], 4251);

        Assert.Equal((0, 425, 3), (buckets[0].MinScore, buckets[0].MaxScore, buckets[0].Count));
        Assert.Equal(426, buckets[1].MinScore);
    }

    [Fact]
    public void MeilleurQue_PartDesAutresJoueursStrictementBattus()
    {
        // Quatre joueurs, le joueur de 700 en bat deux sur les trois autres : 67 %.
        Assert.Equal(67, ScoreDistribution.BetterThanPercent([300, 400, 700, 900], 700));
        // Le plus bas ne bat personne, le plus haut bat tout le monde.
        Assert.Equal(0, ScoreDistribution.BetterThanPercent([300, 400, 700, 900], 300));
        Assert.Equal(100, ScoreDistribution.BetterThanPercent([300, 400, 700, 900], 900));
    }

    [Fact]
    public void MeilleurQue_SansScoreOuSeul_Vide()
    {
        Assert.Null(ScoreDistribution.BetterThanPercent([300, 400], null));
        Assert.Null(ScoreDistribution.BetterThanPercent([300], 300));
        Assert.Null(ScoreDistribution.BetterThanPercent([], 300));
    }

    [Fact]
    public void MeilleurQue_ArrondiAuDessusAMiChemin() =>
        // 1 battu sur 2 autres = 50 % ; 1 sur 3 = 33 % ; 2 sur 8 = 25 %.
        Assert.Equal(33, ScoreDistribution.BetterThanPercent([1, 5, 9, 9], 5));

    // --- les médianes de la v1 ---

    [Theory]
    [InlineData(new int[0], 0)]
    [InlineData(new[] { 700 }, 700)]
    [InlineData(new[] { 100, 900, 500 }, 500)]
    [InlineData(new[] { 100, 201 }, 150)] // division entière : 150,5 devient 150
    public void MedianeEntiere_CommeLaV1(int[] values, int expected) => Assert.Equal(expected, Medians.Integer(values));

    [Theory]
    [InlineData(new int[0], null)]
    [InlineData(new[] { 700 }, 700.0)]
    [InlineData(new[] { 100, 201 }, 150.5)]
    [InlineData(new[] { 900, 100, 500, 300 }, 400.0)]
    public void MedianeDecimale_CommeLAdmin(int[] values, double? expected) => Assert.Equal(expected, Medians.Decimal(values));

    // --- la photo d'un jour ---

    private static readonly IReadOnlyList<DurationScore> Scores = DailyOptions.DefaultDurationScores;

    private static DayStatsPayload Build(
        bool isPast, IReadOnlyList<DaySessionRow> sessions, IReadOnlyDictionary<int, TrackAggregate>? aggregates = null, int trackCount = 2) =>
        DayStatsCalculator.Build(
            Day, 7, isPast, sessions,
            Enumerable.Range(1, trackCount).Select(p => new ChallengeTrackRef(p, 100 + p)).ToList(),
            aggregates ?? new Dictionary<int, TrackAggregate>(), Steps, Scores);

    private static DaySessionRow Session(SessionStatus status, int score = 0) => new(Guid.NewGuid(), status, score);

    [Fact]
    public void Photo_CompteursEtScoresDesPartiesTerminees()
    {
        var payload = Build(isPast: true, [
            Session(SessionStatus.Completed, 4000), Session(SessionStatus.Completed, 2000), Session(SessionStatus.Completed, 3000),
            Session(SessionStatus.Abandoned), Session(SessionStatus.Expired),
        ]);

        Assert.Equal((3, 0, 1, 1), (payload.PlayerCount, payload.PendingCount, payload.AbandonedCount, payload.ExpiredCount));
        Assert.Equal((2000, 4000, 3000.0, 3000.0), (payload.ScoreMin, payload.ScoreMax, payload.ScoreAvg, payload.ScoreMedian));
        Assert.Equal(2, payload.Tracks.Count);
        // 2 morceaux × meilleur palier (1000) : la borne haute de la répartition.
        Assert.Equal(2000, payload.MaxPossibleScore);
    }

    [Fact]
    public void Photo_UnJourRevolu_LesPartiesEnCoursSontDesPartiesExpirees()
    {
        var sessions = new[] { Session(SessionStatus.Pending), Session(SessionStatus.Expired), Session(SessionStatus.Completed, 900) };

        var past = Build(isPast: true, sessions);
        var live = Build(isPast: false, sessions);

        // Le joueur d'un jour passé qui n'est jamais revenu n'est pas « en cours » : il est parti sans terminer.
        Assert.Equal((0, 2), (past.PendingCount, past.ExpiredCount));
        Assert.Equal(["Expired", "Expired", "Completed"], past.Players.Select(p => p.Status));
        Assert.Equal((1, 1), (live.PendingCount, live.ExpiredCount));
        Assert.Equal(["Pending", "Expired", "Completed"], live.Players.Select(p => p.Status));
    }

    [Fact]
    public void Photo_SansPartieTerminee_PasDeScoreNiDeMediane()
    {
        var payload = Build(isPast: true, [Session(SessionStatus.Abandoned)]);

        Assert.Null(payload.ScoreMin);
        Assert.Null(payload.ScoreMax);
        Assert.Null(payload.ScoreAvg);
        Assert.Null(payload.ScoreMedian);
        Assert.Equal(0, payload.PlayerCount);
        Assert.All(payload.ScoreDistribution, b => Assert.Equal(0, b.Count));
    }

    [Fact]
    public void Photo_ChiffresParMorceau()
    {
        // Morceau 1 : 4 réponses, dont l'artiste juste 3 fois, le titre 2 fois, 1 prolongation, 1 raté (ni l'un ni l'autre) ; 12 s écoutées en tout.
        var aggregates = new Dictionary<int, TrackAggregate>
        {
            [1] = new(1, Total: 4, ArtistCorrect: 3, TitleCorrect: 2, Found: 3, Extended: 1, ListenedSum: 12m, FoundListenedSum: 5m,
                new Dictionary<decimal, int> { [1m] = 2, [3m] = 1 }),
        };

        var tracks = Build(isPast: true, [Session(SessionStatus.Completed, 100)], aggregates).Tracks;

        var first = tracks[0];
        Assert.Equal((1, 101, 4), (first.Position, first.TrackId, first.TotalAnswers));
        Assert.Equal((75.0, 50.0, 25.0, 3.0, 1), (first.ArtistCorrectRate, first.TitleCorrectRate, first.ExtendedRate, first.AvgListenedSeconds, first.NotFoundCount));
        // Un palier par durée autorisée, comptes à 0 compris, dans l'ordre croissant.
        Assert.Equal(Steps, first.GuessTimeDistribution.Select(b => b.Seconds));
        Assert.Equal([0, 2, 0, 0, 1, 0, 0], first.GuessTimeDistribution.Select(b => b.Count));
    }

    [Fact]
    public void Photo_MorceauSansReponse_ZeroPartout()
    {
        var second = Build(isPast: true, [], new Dictionary<int, TrackAggregate> { [1] = TrackAggregate.Empty(1) }).Tracks[1];

        Assert.Equal((0, 0.0, 0.0, 0.0, 0), (second.TotalAnswers, second.ArtistCorrectRate, second.TitleCorrectRate, second.ExtendedRate, second.NotFoundCount));
        Assert.Null(second.AvgListenedSeconds);
        Assert.Equal(Steps.Length, second.GuessTimeDistribution.Count);
    }

    [Fact]
    public void Photo_GardeLesPaliersEtLeBaremeDuJour()
    {
        var payload = Build(isPast: true, []);

        // Changer un réglage plus tard ne doit pas réécrire l'histoire : les paliers et le barème de ce jour sont dans la photo.
        Assert.Equal(Steps, payload.AllowedDurationsSeconds);
        Assert.Equal(Scores, payload.DurationScores);
        Assert.Equal((DayStatsPayload.CurrentVersion, Day, 7), (payload.Version, payload.Date, payload.ChallengeId));
    }

    [Fact]
    public void Photo_SeRelitTelleQuElleAEteEcrite()
    {
        var original = Build(isPast: true, [Session(SessionStatus.Completed, 850)], new Dictionary<int, TrackAggregate>
        {
            [1] = new(1, 2, 2, 1, 2, 1, 3m, 3m, new Dictionary<decimal, int> { [1.5m] = 2 }),
        });

        var read = DayStatsJson.Read(DayStatsJson.Write(original))!;

        Assert.Equal(original.Date, read.Date);
        Assert.Equal(original.Tracks[0].GuessTimeDistribution, read.Tracks[0].GuessTimeDistribution);
        Assert.Equal(original.Players, read.Players);
        Assert.Equal(original.ScoreDistribution, read.ScoreDistribution);
        Assert.Equal(original.DurationScores, read.DurationScores);
        // camelCase, comme le reste de l'API.
        Assert.Contains("\"playerCount\":1", DayStatsJson.Write(original), StringComparison.Ordinal);
    }

    // --- les stories hebdo ---

    private static WeeklyRecapRules.Ranked Row(int track, int answers, int fullyCorrect) => new(track, answers, fullyCorrect);

    [Fact]
    public void Classement_LePlusTrouveEtLePlusRate()
    {
        var (found, missed) = WeeklyRecapRules.Rank([Row(1, 10, 9), Row(2, 10, 2), Row(3, 10, 5)], WeeklyRecapRules.MinAnswers);

        Assert.Equal((1, 90.0), (found!.TrackId, found.RatePercent));
        Assert.Equal((2, 20.0), (missed!.TrackId, missed.RatePercent));
    }

    [Fact]
    public void Classement_AuMoinsTroisReponses_SinonPasEligible()
    {
        Assert.Equal((null, null), WeeklyRecapRules.Rank([Row(1, 2, 2), Row(2, 2, 0)], 3));
    }

    [Fact]
    public void Classement_AEgaliteDeTaux_LePlusReponduLEmporte()
    {
        var (found, missed) = WeeklyRecapRules.Rank([Row(1, 4, 2), Row(2, 10, 5), Row(3, 6, 3)], 3);

        Assert.Equal(2, found!.TrackId);
        // Le plus raté est le pire taux restant, à égalité aussi le plus répondu.
        Assert.Equal(3, missed!.TrackId);
    }

    [Fact]
    public void Classement_UnSeulMorceauEligible_PasDePlusRate()
    {
        var (found, missed) = WeeklyRecapRules.Rank([Row(1, 5, 5), Row(2, 1, 0)], 3);

        Assert.Equal(1, found!.TrackId);
        Assert.Null(missed);
    }

    [Fact]
    public void Periode_ParDefaut_LesSeptDerniersJoursAujourdhuiCompris()
    {
        var today = new DateOnly(2026, 10, 7);

        Assert.True(WeeklyRecapRules.TryResolvePeriod(null, null, today, out var from, out var to, out var error));

        Assert.Equal((new DateOnly(2026, 10, 1), today, null), (from, to, error));
    }

    [Fact]
    public void Periode_BornesDonnees_OuSeulementLaFin()
    {
        var today = new DateOnly(2026, 10, 7);

        Assert.True(WeeklyRecapRules.TryResolvePeriod("2026-09-01", "2026-09-30", today, out var from, out var to, out _));
        Assert.Equal((new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30)), (from, to));

        Assert.True(WeeklyRecapRules.TryResolvePeriod(null, "2026-09-10", today, out from, out to, out _));
        Assert.Equal((new DateOnly(2026, 9, 4), new DateOnly(2026, 9, 10)), (from, to));
    }

    [Theory]
    [InlineData("2026-9-1", null, "admin.invalid_date")]
    [InlineData("hier", null, "admin.invalid_date")]
    [InlineData(null, "07/10/2026", "admin.invalid_date")]
    [InlineData("2026-10-08", "2026-10-01", "admin.invalid_period")]
    [InlineData("2024-01-01", "2026-10-07", "admin.invalid_period")] // plus d'un an
    public void Periode_Invalide_CodeStable(string? from, string? to, string code)
    {
        Assert.False(WeeklyRecapRules.TryResolvePeriod(from, to, new DateOnly(2026, 10, 7), out _, out _, out var error));
        Assert.Equal(code, error);
    }

    [Fact]
    public void Periode_UnAnPile_Accepte() =>
        Assert.True(WeeklyRecapRules.TryResolvePeriod("2025-10-07", "2026-10-07", new DateOnly(2026, 10, 7), out _, out _, out _));
}
