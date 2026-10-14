using System.Globalization;
using System.Text.RegularExpressions;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.UnitTests.Support;

namespace InSeconds.UnitTests.Daily;

/// <summary>
/// Fige le texte des journaux du jeu que les tableaux Grafana lisent par expression régulière (#314). Changer un de ces
/// messages vide les panneaux en silence : mettre à jour les tableaux (<c>grafana/*.json</c> du dossier du projet) en même temps.
/// </summary>
public sealed class DailyLogTests
{
    // Copiée de inseconds-jeu.json (panneaux « Par morceau » et « Artiste / titre trouvés par morceau »).
    private static readonly Regex JeuParMorceau = new(
        @"morceau (?<morceau>\d+)\) : palier (?<palier>[0-9.,]+)s, artiste (?<artiste>\w+), titre (?<titre>\w+), indice (?<indice>\d+), score (?<score>\d+)(?: — morceau n°(?<position>\d+) : (?<titre_morceau>.+))?");

    // Copiée de inseconds-jeu.json (panneau « Indices utilisés »).
    private static readonly Regex JeuIndice = new(
        @"palier (?<palier>[0-9.,]+)s, artiste (?<artiste>\w+), titre (?<titre>\w+), indice (?<indice>\d+), score (?<score>\d+)");

    private static readonly Guid PlayerId = Guid.Parse("6f1c2a4e-0000-4000-8000-000000000001");

    [Fact]
    public void Reponse_TexteDeLaV1()
    {
        var logger = new CapturingLogger<DailyLogTests>();

        DailyLog.AnswerSubmitted(logger, PlayerId, 42, 731, 1.5m, true, false, 1, 490, 3, "Daft Punk", "Get Lucky");

        var entry = Assert.Single(logger.Entries);
        Assert.Equal(1002, entry.EventId.Id);
        Assert.Equal(
            $"Réponse de {PlayerId} (partie 42, morceau 731) : palier 1.5s, artiste True, titre False, indice 1, score 490 — morceau n°3 : Daft Punk / Get Lucky",
            entry.Message);
    }

    [Fact]
    public void Reponse_LueParLesExpressionsDesTableauxGrafana()
    {
        var logger = new CapturingLogger<DailyLogTests>();

        // Culture française : la virgule décimale doit rester lisible par « palier ([0-9.,]+)s ».
        var culture = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
        try
        {
            DailyLog.AnswerSubmitted(logger, PlayerId, 42, 731, 0.5m, false, true, 0, 1000, 5, "AC/DC", "Back In Black");
        }
        finally
        {
            CultureInfo.CurrentCulture = culture;
        }

        var message = Assert.Single(logger.Entries).Message;
        var match = JeuParMorceau.Match(message);
        Assert.True(match.Success, message);
        Assert.Equal("731", match.Groups["morceau"].Value);
        Assert.Equal("False", match.Groups["artiste"].Value);
        Assert.Equal("True", match.Groups["titre"].Value);
        Assert.Equal("0", match.Groups["indice"].Value);
        Assert.Equal("1000", match.Groups["score"].Value);
        Assert.Equal("5", match.Groups["position"].Value);
        Assert.Equal("AC/DC / Back In Black", match.Groups["titre_morceau"].Value);
        Assert.Matches("^0[.,]5$", match.Groups["palier"].Value);
        Assert.Matches(JeuIndice, message);
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
}
