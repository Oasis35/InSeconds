using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>Les manches à thème d'une playlist (thèmes de la liste de l'admin, jamais la première manche) : ce qui s'offre, et le tirage.</summary>
public class RunThemesTests
{
    private static readonly RunRules Rules = RunsOptions.DefaultRules();

    [Fact]
    public void SansTheme_TousLesMorceauxSontDedans_AvecTheme_SeulementCeuxQuiL_Ont()
    {
        Assert.True(RunThemes.Matches(null, null));
        Assert.True(RunThemes.Matches(3, [3]));
        Assert.True(RunThemes.Matches(3, [1, 3]));
        Assert.False(RunThemes.Matches(3, [4]));
        Assert.False(RunThemes.Matches(3, null));
    }

    [Fact]
    public void Offerts_SeulementLesThemesQuiOntAssezDeMorceauxPourUneMancheEtSaReserve()
    {
        // 5 morceaux de la manche + 2 de réserve = 7.
        var themes = Enumerable.Range(0, 7).Select(_ => (IReadOnlyList<int>?)[1])
            .Concat(Enumerable.Range(0, 6).Select(_ => (IReadOnlyList<int>?)[2])).Concat([null, []]).ToList();

        Assert.Equal([1], RunThemes.Eligible(themes, Rules));
        Assert.Equal([1, 2], RunThemes.Eligible(themes.Append([2]), Rules));
    }

    [Fact]
    public void LesReglesParDefaut_LesManchesDeuxATroisEtQuatrePeuventAvoirUnTheme_JamaisLaPremiere() =>
        Assert.Equal([2, 3, 4], new RunsOptions().EffectiveThemedRounds);

    [Theory]
    [InlineData(1)]
    [InlineData(5)]
    public void UneMancheATheme_HorsDeLaDeuxiemeALaDerniere_RefuseeParLesReglages(int round) =>
        Assert.Contains(RunsOptionsChecks.Problems(new RunsOptions { ThemedRounds = [round] }), p => p.Contains("ThemedRounds"));

    [Fact]
    public void UnChoixDeThemeDemandeTroisThemesAuMoins_DeuxAChoisirEtDeQuoiTirerLeMystere() =>
        Assert.Equal(3, RunThemes.MinEligibleThemes);

    private static readonly DateTimeOffset Now = new(2026, 11, 11, 8, 0, 0, TimeSpan.Zero);
    private static readonly IRunScoringPolicy Scoring = new ArtistTitleScoring();
    private static readonly RoundOutcome Found = new(true, true, 10m, 0);
    private static readonly Guid Creator = Guid.NewGuid();

    // 20 morceaux (1 à 20) et 8 de réserve (21 à 28) ; la manche 2 attend son thème.
    private static RunChallenge Pending(int round = 2)
    {
        var rules = Rules with { PendingThemeRound = round };
        var tracks = Enumerable.Range(1, rules.TrackCount)
            .Select(id => new PlannedTrack(id, (id - 1) / rules.TracksPerRound + 1, rules.MultiplierOf((id - 1) / rules.TracksPerRound + 1))).ToList();
        var reserve = Enumerable.Range(1, rules.Rounds * rules.ReservePerRound)
            .Select(i => new PlannedTrack(20 + i, (i - 1) / rules.ReservePerRound + 1, 1m)).ToList();
        return RunChallenge.Create("K7Q2M9", 1, rules, tracks, Creator, Now, reserve);
    }

    private static RunSession InRoundTwo(RunChallenge challenge, Guid? player = null)
    {
        var session = RunSession.Start(0, player ?? Creator, Now);
        for (var i = 0; i < 5; i++)
            session.Answer(challenge, Found, Scoring, Now);
        return session;
    }

    [Fact]
    public void ApplyTheme_RemplaceLesMorceauxEtLaReserveDeLaManche_LesAutresMancheNeBougentPas_LeThemeEstFige()
    {
        var challenge = Pending();

        challenge.ApplyTheme(new RunRoundTheme(2, 7, "Films"), [101, 102, 103, 104, 105], [106, 107]);

        Assert.Equal([101, 102, 103, 104, 105], challenge.Tracks.Where(t => t.Round == 2).OrderBy(t => t.Position).Select(t => t.TrackId));
        Assert.Equal([106, 107], challenge.ReserveOf(2).Select(r => r.TrackId));
        Assert.Equal(Enumerable.Range(1, 5), challenge.Tracks.Where(t => t.Round == 1).Select(t => t.TrackId));
        Assert.Equal([3], challenge.Tracks.Where(t => t.Round == 3).Select(t => (int)t.Round).Distinct());
        Assert.Null(challenge.Rules.PendingThemeRound);
        Assert.Equal(new RunRoundTheme(2, 7, "Films"), Assert.Single(challenge.Rules.Themes!));
    }

    [Fact]
    public void ApplyTheme_RefuseUneMancheQuiNAttendPasDeTheme()
    {
        var challenge = Pending();

        Assert.Throws<InvalidOperationException>(() => challenge.ApplyTheme(new RunRoundTheme(3, 7, "Films"), [101, 102, 103, 104, 105], [106, 107]));
    }

    [Fact]
    public void ApplyTheme_RefuseUnMorceauDEUneAutreManche_OuLeMauvaisNombre()
    {
        var challenge = Pending();

        Assert.Throws<ArgumentException>(() => challenge.ApplyTheme(new RunRoundTheme(2, 7, "Films"), [1, 102, 103, 104, 105], [106, 107]));
        Assert.Throws<ArgumentException>(() => challenge.ApplyTheme(new RunRoundTheme(2, 7, "Films"), [101, 102, 103, 104], [106, 107]));
        Assert.Equal(2, challenge.Rules.PendingThemeRound);
    }

    [Fact]
    public void DropPendingTheme_LaMancheSeJoueSansTheme_AvecSesMorceauxDeRang()
    {
        var challenge = Pending();

        challenge.DropPendingTheme();

        Assert.Null(challenge.Rules.PendingThemeRound);
        Assert.Null(challenge.Rules.Themes);
        Assert.Equal(Enumerable.Range(6, 5), challenge.Tracks.Where(t => t.Round == 2).Select(t => t.TrackId));
    }

    [Fact]
    public void LeCreateurChoisitLeThemeAvantLePremierSonDeLaManche_LaDifficulteAttendLeTheme()
    {
        var challenge = Pending();
        var session = InRoundTwo(challenge);

        Assert.True(session.CanChooseTheme(challenge));
        Assert.False(session.CanChooseDifficulty(challenge, 2));
        Assert.False(session.CanSwap(challenge));

        challenge.ApplyTheme(new RunRoundTheme(2, 7, "Films"), [101, 102, 103, 104, 105], [106, 107]);

        Assert.False(session.CanChooseTheme(challenge));
        Assert.True(session.CanChooseDifficulty(challenge, 2));
    }

    [Fact]
    public void UnAmiNeChoisitPasLeTheme_ElleNEstPasProposeAvantLaMancheEnAttente()
    {
        var challenge = Pending();

        Assert.False(InRoundTwo(challenge, Guid.NewGuid()).CanChooseTheme(challenge));
        // Au départ, la manche 1 n'a jamais de thème : rien n'est proposé.
        Assert.False(RunSession.Start(0, Creator, Now).CanChooseTheme(challenge));
    }
}
