using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Gameplay.Contracts;

namespace InSeconds.UnitTests.Daily;

/// <summary>Ce que la révélation montre juste après la réponse : la moyenne de ceux qui ont trouvé, le taux d'échec, « en combien de temps ».</summary>
public class TrackAnswerStatsTests
{
    private static readonly decimal[] Steps = [0.5m, 1m, 1.5m, 2m, 3m, 5m, 10m];

    private static PriorAnswerStats Prior(int found, decimal foundSeconds, int notFound, params (decimal Seconds, int Count)[] byDuration) =>
        new(found + notFound, found, foundSeconds, notFound, byDuration.ToDictionary(d => d.Seconds, d => d.Count));

    [Fact]
    public void PremierJoueur_TrouveLeMorceau_MoyenneEgaleASonPalier_AucunEchec()
    {
        var stats = TrackAnswerStats.Build(PriorAnswerStats.None, new RoundOutcome(true, false, 2, 0), Steps);

        Assert.Equal((2d, 0d, 0), (stats.AverageSecondsWhenFound, stats.FailureRatePercent, stats.NotFoundCount));
        Assert.Equal([0, 0, 0, 1, 0, 0, 0], stats.GuessTimeDistribution.Select(b => b.Count));
    }

    [Fact]
    public void PremierJoueur_NeTrouvePas_PasDeMoyenne_ToutEnEchec()
    {
        var stats = TrackAnswerStats.Build(PriorAnswerStats.None, new RoundOutcome(false, false, 1, 0), Steps);

        Assert.Null(stats.AverageSecondsWhenFound);
        Assert.Equal((100d, 1), (stats.FailureRatePercent, stats.NotFoundCount));
        Assert.All(stats.GuessTimeDistribution, b => Assert.Equal(0, b.Count));
    }

    [Fact]
    public void AvecLesAutres_LaReponseCouranteEstComptee()
    {
        // Trois ont déjà trouvé (1 s, 1 s, 3 s) et un a échoué ; celui-ci trouve à 1 s.
        var prior = Prior(found: 3, foundSeconds: 5, notFound: 1, (1m, 2), (3m, 1));

        var stats = TrackAnswerStats.Build(prior, new RoundOutcome(true, true, 1, 0), Steps);

        Assert.Equal(6d / 4, stats.AverageSecondsWhenFound);
        Assert.Equal((20d, 1), (stats.FailureRatePercent, stats.NotFoundCount));
        Assert.Equal([0, 3, 0, 0, 1, 0, 0], stats.GuessTimeDistribution.Select(b => b.Count));
    }

    [Fact]
    public void TauxDEchec_ArrondiAUneDecimale()
    {
        // 1 échec sur 3 réponses : 33,3 %.
        var stats = TrackAnswerStats.Build(Prior(found: 1, foundSeconds: 1, notFound: 0, (1m, 1)), new RoundOutcome(false, false, 1, 0), Steps);
        Assert.Equal(50d, stats.FailureRatePercent);

        var third = TrackAnswerStats.Build(Prior(found: 2, foundSeconds: 2, notFound: 0, (1m, 2)), new RoundOutcome(false, false, 1, 0), Steps);
        Assert.Equal(33.3, third.FailureRatePercent);
    }

    [Fact]
    public void Histogramme_UnPalierParDureeAutorisee_CroissantEtSansDoublon_ComptesANulCompris()
    {
        var stats = TrackAnswerStats.Build(PriorAnswerStats.None, new RoundOutcome(true, true, 1, 0), [10m, 1m, 3m, 1m]);

        Assert.Equal([1m, 3m, 10m], stats.GuessTimeDistribution.Select(b => b.Seconds));
        Assert.Equal([1, 0, 0], stats.GuessTimeDistribution.Select(b => b.Count));
    }

    [Fact]
    public void ArtisteSeulOuTitreSeul_CompteCommeTrouve()
    {
        Assert.Equal(1, TrackAnswerStats.Build(PriorAnswerStats.None, new RoundOutcome(true, false, 1, 0), Steps).GuessTimeDistribution.Sum(b => b.Count));
        Assert.Equal(1, TrackAnswerStats.Build(PriorAnswerStats.None, new RoundOutcome(false, true, 1, 0), Steps).GuessTimeDistribution.Sum(b => b.Count));
    }
}
