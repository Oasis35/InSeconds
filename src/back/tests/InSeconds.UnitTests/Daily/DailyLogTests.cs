using InSeconds.Api.Modules.Daily.Application;
using InSeconds.UnitTests.Support;

namespace InSeconds.UnitTests.Daily;

/// <summary>
/// Fige le texte des journaux du jeu, que le tableau Grafana « Un joueur » filtre (« Réponse de », « Indice niveau »…, cf.
/// <c>deploy/grafana/</c>). Changer un de ces messages vide le panneau en silence : mettre le tableau à jour en même temps. Les chiffres du
/// jeu ne passent plus par ces textes : ce sont les compteurs de <see cref="DailyMetrics"/>.
/// </summary>
public sealed class DailyLogTests
{
    private static readonly Guid PlayerId = Guid.Parse("6f1c2a4e-0000-4000-8000-000000000001");

    [Fact]
    public void Reponse_TexteDeLaV1()
    {
        var logger = new CapturingLogger<DailyLogTests>();

        DailyLog.AnswerSubmitted(logger, PlayerId, 42, 731, 1.5m, true, false, 1, 490, 3, "Daft Punk", "Get Lucky");

        var entry = Assert.Single(logger.Entries);
        Assert.Equal(1002, entry.EventId.Id);
        Assert.Equal(
            $"Réponse de {PlayerId} (partie 42, morceau 731) : palier 1.5s, artiste True, titre False, indice 1, score 490 - morceau n°3 : Daft Punk / Get Lucky",
            entry.Message);
    }

    [Fact]
    public void Reponse_SansLaReponseSaisie()
    {
        var logger = new CapturingLogger<DailyLogTests>();

        DailyLog.AnswerSubmitted(logger, PlayerId, 42, 731, 1m, true, true, 0, 850, 1, "Daft Punk", "Get Lucky");

        // Seuls les identifiants, le résultat et le morceau attendu : aucune propriété ne peut porter ce que le joueur a tapé.
        var names = Assert.Single(logger.Entries).Properties.Select(p => p.Key).Where(k => k != "{OriginalFormat}").Order();
        Assert.Equal(
            new[] { "PlayerId", "SessionId", "TrackId", "ListenedSeconds", "ArtistCorrect", "TitleCorrect", "HintLevel", "Score", "TrackPosition", "TrackArtist", "TrackTitle" }
                .Order(),
            names);
    }

    [Fact]
    public void Indice_TexteFige()
    {
        var logger = new CapturingLogger<DailyLogTests>();

        DailyLog.HintRequested(logger, 2, PlayerId, 42, 731, 3);

        var entry = Assert.Single(logger.Entries);
        Assert.Equal(1004, entry.EventId.Id);
        Assert.Equal($"Indice niveau 2 demandé par {PlayerId} (partie 42, morceau 731, n°3)", entry.Message);
    }

    [Fact]
    public void Indice_NeNommePasSonNiveauLevel()
    {
        var logger = new CapturingLogger<DailyLogTests>();

        DailyLog.HintRequested(logger, 2, PlayerId, 42, 731, 3);

        // Une propriété « Level » serait prise par Grafana pour le niveau du journal (indices classés « 1 » et « 2 »).
        var names = Assert.Single(logger.Entries).Properties.Select(p => p.Key);
        Assert.Contains("HintLevel", names);
        Assert.DoesNotContain("Level", names);
    }
}
