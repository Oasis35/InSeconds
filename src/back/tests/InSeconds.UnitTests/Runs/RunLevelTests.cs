using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>La politique du niveau : 80/20, un disque de plus au plus, 10 % de baisse au plus, l'inactivité, le disque et la progression.</summary>
public class RunLevelPolicyTests
{
    private static readonly RunLevelRules Rules = new RunLevelOptions().ToRules();
    private static readonly IReadOnlyList<RunLevelStep> Ladder = Rules.Ladder;
    private static readonly DateTimeOffset Last = new(2026, 11, 1, 20, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(2000, 3000, 2200)] // 80 % de 2 000 + 20 % de 3 000
    [InlineData(1, 2, 1)] // arrondi au plus proche
    [InlineData(13000, 20000, 14400)] // au dernier disque, plus de plafond
    public void LeNiveau_Est80PourCentDeLAncien_Et20PourCentDuScore(int current, int score, int expected) =>
        Assert.Equal(expected, RunLevelPolicy.Next(current, score, Rules));

    [Theory]
    [InlineData(0, 6000, 300)] // le premier disque, pas plus
    [InlineData(300, 20000, 900)] // du disque rayé au bronze, pas plus
    [InlineData(2100, 20000, 3600)] // de l'argent à l'or pile
    public void UneSerie_NeFaitMonterQueDUnDisque(int current, int score, int expected)
    {
        var after = RunLevelPolicy.Next(current, score, Rules);

        Assert.Equal(expected, after);
        Assert.Equal(RunDiscChange.Up, RunLevelPolicy.DiscChange(current, after, Ladder));
    }

    [Theory]
    [InlineData(2000, 0, 1800)]
    [InlineData(1000, 0, 900)]
    [InlineData(301, 0, 271)] // arrondi au-dessus : jamais plus de 10 %
    public void UneMauvaiseSerie_NeFaitPasPerdrePlusDe10PourCent(int current, int score, int expected) =>
        Assert.Equal(expected, RunLevelPolicy.Next(current, score, Rules));

    [Fact]
    public void LeChangementDeDisque_PeutEtreUneBaisse()
    {
        Assert.Equal(RunDiscChange.Down, RunLevelPolicy.DiscChange(2000, 1800, Ladder));
        Assert.Equal(RunDiscChange.Same, RunLevelPolicy.DiscChange(2400, 2200, Ladder));
        Assert.Equal(RunDiscChange.Same, RunLevelPolicy.DiscChange(100, 200, Ladder));
    }

    [Theory]
    [InlineData(0, null, "runs.discs.scratched", 300, 0)]
    [InlineData(299, null, "runs.discs.scratched", 1, 99)]
    [InlineData(300, "runs.discs.scratched", "runs.discs.bronze", 600, 0)]
    [InlineData(2340, "runs.discs.silver", "runs.discs.gold", 1260, 21)]
    [InlineData(9600, "runs.discs.double_platinum", "runs.discs.diamond", 3400, 0)]
    public void LeDisque_EtLaProgression(int points, string? disc, string next, int toNext, int progress)
    {
        var standing = RunLevelPolicy.Standing(points, Ladder);

        Assert.Equal((disc, next, toNext, progress), (standing.Current?.Disc, standing.Next!.Disc, standing.PointsToNext, standing.ProgressPercent));
    }

    [Fact]
    public void AuDernierDisque_PasDeSuivant_EtLaJaugeEstPleine()
    {
        var standing = RunLevelPolicy.Standing(99999, Ladder);

        Assert.Equal("runs.discs.diamond", standing.Current!.Disc);
        Assert.Null(standing.Next);
        Assert.Null(standing.PointsToNext);
        Assert.Equal(100, standing.ProgressPercent);
    }

    [Fact]
    public void UneEchelleVide_EstRefusee() => Assert.Throws<ArgumentException>(() => RunLevelPolicy.Standing(0, []));

    [Fact]
    public void LesPointsNegatifs_NOntPasDeDisque()
    {
        var standing = RunLevelPolicy.Standing(-5, Ladder);

        Assert.Null(standing.Current);
        Assert.Equal(0, standing.ProgressPercent);
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(13.9, 0)]
    [InlineData(14, 1)]
    [InlineData(20.9, 1)]
    [InlineData(21, 2)]
    [InlineData(400, 56)]
    public void LInactivite_Compte14JoursDeGrace_PuisUneBaisseParSemaine(double days, int weeks) =>
        Assert.Equal(weeks, RunLevelPolicy.InactiveWeeks(Last, Last.AddDays(days), Rules));

    [Theory]
    [InlineData(2000, 0, 2000)]
    [InlineData(2000, 1, 1900)]
    [InlineData(2000, 2, 1800)]
    [InlineData(2000, 10, 1000)]
    [InlineData(2000, 30, 1000)] // jamais sous la moitié
    public void LInactivite_Retire5PourCentParSemaine_JusquALaMoitie(int points, int weeks, int expected) =>
        Assert.Equal(expected, RunLevelPolicy.AfterInactivity(points, weeks, Rules));

    [Fact]
    public void LaBaisseDuDisque_EstAnnoncee_AvantDArriver()
    {
        // Argent à 2 340 : 2 223 (sem. 1), 2 106 (sem. 2), 1 989 (sem. 3, plus d'argent), soit 28 jours après la dernière partie.
        Assert.Equal(new RunLevelNow(2340, 0, 18), RunLevelPolicy.Now(2340, Last, Last.AddDays(10), Rules));
        Assert.Equal(new RunLevelNow(2106, 234, 3), RunLevelPolicy.Now(2340, Last, Last.AddDays(25), Rules));

        var lost = RunLevelPolicy.Now(2340, Last, Last.AddDays(29), Rules);
        Assert.Equal("runs.discs.bronze", RunLevelPolicy.Standing(lost.Points, Ladder).Current!.Disc);
    }

    [Fact]
    public void SansDisque_OuProtegeParLePlancher_RienNEstAnnonce()
    {
        Assert.Null(RunLevelPolicy.Now(250, Last, Last.AddDays(20), Rules).DiscDropInDays);
        // 700 points : le plancher (350) garde le disque rayé (300).
        Assert.Null(RunLevelPolicy.Now(700, Last, Last.AddDays(20), Rules).DiscDropInDays);
    }

    [Fact]
    public void LaTransition_DeduitLInactiviteJusquALaFinDeLaSerie()
    {
        Assert.Equal((0, 300), RunLevelPolicy.Apply(0, null, 6000, Last, Rules));
        // 2 000 points, 21 jours plus tard (2 semaines comptées) : 1 800 avant la série, puis 80 % de 1 800 + 20 % de 2 000.
        Assert.Equal((1800, 1840), RunLevelPolicy.Apply(2000, Last, 2000, Last.AddDays(21), Rules));
    }

    [Fact]
    public void SansBaisseHebdomadaire_LInactiviteNeChangeRien()
    {
        var rules = Rules with { InactivityWeeklyDropPercent = 0 };

        Assert.Equal(new RunLevelNow(2340, 0, null), RunLevelPolicy.Now(2340, Last, Last.AddDays(200), rules));
    }
}

public class RunLevelTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 11, 8, 0, 0, TimeSpan.Zero);
    private static readonly RunLevelRules Rules = new RunLevelOptions().ToRules();
    private static int _nextId = 100;

    /// <summary>
    /// Une partie finie : <paramref name="roundsFound"/> manches entièrement trouvées (500, 1 000, 1 750, 2 750 points : le palier raccourcit à chacune),
    /// puis la suivante ratée jusqu'à la dernière vie.
    /// </summary>
    private static RunSession Finished(Guid player, int roundsFound, DateTimeOffset? at = null)
    {
        var end = at ?? Now;
        var rules = TestRules.Legacy();
        var challenge = RunChallenge.Create("K7Q2M9", 1, rules, Enumerable.Range(1, 5).ToList(), null, Now);
        for (var round = 2; round <= roundsFound + 1; round++)
            challenge.AppendRound(round, Enumerable.Range(rules.FirstPositionOf(round), 5).ToList());
        var session = RunSession.Start(0, player, Now);
        typeof(RunSession).GetProperty(nameof(RunSession.Id))!.SetValue(session, _nextId++);
        while (session.IsPending)
        {
            var found = rules.RoundOf(session.NextPosition) <= roundsFound;
            session.Answer(challenge, new RoundOutcome(found, found, 10m), new ArtistTitleScoring(), end);
        }

        return session;
    }

    [Fact]
    public void LaPremiereSerie_DonneAuPlusLePremierDisque_EtLeGainEstCeNiveau()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);
        var session = Finished(player, 4);

        level.Record(session, Rules);

        Assert.Equal(6000, session.TotalScore);
        Assert.Equal((300, 1, 300), (level.Points, level.RunsPlayed, level.LastDelta));
        Assert.Equal(300, level.DeltaOf(session.Id));
        Assert.Equal(RunDiscChange.Up, level.DiscChangeOf(session.Id, Rules.Ladder));
        Assert.Null(level.DiscChangeOf(-1, Rules.Ladder));
    }

    [Fact]
    public void LesBonnesSeries_MontentUnDisqueALaFois()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);

        var points = new List<int>();
        for (var i = 0; i < 4; i++)
        {
            level.Record(Finished(player, 4), Rules);
            points.Add(level.Points);
        }

        // 300 (rayé), 900 (bronze), 1 920 (80 % de 900 + 1 200, sous l'argent), 2 000 (l'argent pile).
        Assert.Equal([300, 900, 1920, 2000], points);
    }

    [Fact]
    public void UneMauvaiseSerie_FaitBaisserDe10PourCentAuPlus()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);
        level.Record(Finished(player, 4), Rules);
        level.Record(Finished(player, 4), Rules);
        var bad = Finished(player, 0);

        level.Record(bad, Rules);

        Assert.Equal(0, bad.TotalScore);
        Assert.Equal(810, level.Points);
        Assert.Equal(-90, level.DeltaOf(bad.Id));
        Assert.Equal(RunDiscChange.Down, level.DiscChangeOf(bad.Id, Rules.Ladder));
        Assert.Equal(3, level.RunsPlayed);
    }

    [Fact]
    public void LInactivite_SeDeduitALaLecture_PuisDuNiveauDeLaSerieSuivante()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);
        level.Record(Finished(player, 4), Rules);
        level.Record(Finished(player, 4), Rules);

        // 900 points, puis 35 jours sans partie (4 semaines comptées : 14, 21, 28 et 35 jours) : 720, le niveau stocké ne bouge pas.
        var later = Now.AddDays(35);
        Assert.Equal(new RunLevelNow(720, 180, null), level.At(later, Rules));
        Assert.Equal(900, level.Points);

        level.Record(Finished(player, 1, later), Rules);

        // 80 % de 720 + 20 % de 500 = 676 : la perte se compte depuis le niveau inactivité déduite.
        Assert.Equal((676, -44, later), (level.Points, level.LastDelta, level.UpdatedAt));
    }

    [Fact]
    public void UnePartieDejaComptee_NeLEstPasDeuxFois()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);
        var session = Finished(player, 4);
        level.Record(session, Rules);

        level.Record(session, Rules);

        Assert.Equal((1, 300), (level.RunsPlayed, level.Points));
    }

    [Fact]
    public void LeGain_EstVide_PourUneAutrePartie()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);
        level.Record(Finished(player, 4), Rules);

        Assert.Null(level.DeltaOf(-1));
    }

    [Fact]
    public void UnePartieEnCoursOuAbandonnee_NeCompteJamais()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);
        var pending = RunSession.Start(0, player, Now);
        var abandoned = RunSession.Start(0, player, Now);
        abandoned.Abandon(Now);

        Assert.Throws<InvalidOperationException>(() => level.Record(pending, Rules));
        Assert.Throws<InvalidOperationException>(() => level.Record(abandoned, Rules));
    }

    [Fact]
    public void LaPartieDUnAutreJoueur_EstRefusee() =>
        Assert.Throws<ArgumentException>(() => RunLevel.Start(Guid.NewGuid(), Now).Record(Finished(Guid.NewGuid(), 4), Rules));
}

public class RunLevelOptionsTests
{
    [Fact]
    public void LesDefauts_SontCoherents_EtLaListeSansValeurInitiale()
    {
        var options = new RunsOptions();

        Assert.Empty(RunsOptionsChecks.Problems(options));
        Assert.Null(options.Levels.Discs);
        Assert.Equal(
            [("scratched", 300), ("bronze", 900), ("silver", 2000), ("gold", 3600), ("platinum", 6000), ("double_platinum", 9600), ("diamond", 13000)],
            options.Levels.EffectiveDiscs.Select(d => (d.Disc["runs.discs.".Length..], d.Points)));
        var rules = options.Levels.ToRules();
        Assert.Equal((80, 10, 14, 5, 50), (rules.OldWeightPercent, rules.MaxDropPercent, rules.InactivityGraceDays, rules.InactivityWeeklyDropPercent, rules.InactivityFloorPercent));
    }

    public static TheoryData<RunLevelOptions, string> Incoherent => new()
    {
        { new RunLevelOptions { OldWeightPercent = 49 }, "Runs:Levels:OldWeightPercent" },
        { new RunLevelOptions { OldWeightPercent = 96 }, "Runs:Levels:OldWeightPercent" },
        { new RunLevelOptions { MaxDropPercent = -1 }, "Runs:Levels:MaxDropPercent" },
        { new RunLevelOptions { MaxDropPercent = 51 }, "Runs:Levels:MaxDropPercent" },
        { new RunLevelOptions { InactivityGraceDays = 0 }, "Runs:Levels:InactivityGraceDays" },
        { new RunLevelOptions { InactivityWeeklyDropPercent = 51 }, "Runs:Levels:InactivityWeeklyDropPercent" },
        { new RunLevelOptions { InactivityFloorPercent = 101 }, "Runs:Levels:InactivityFloorPercent" },
        { new RunLevelOptions { Discs = [] }, "Runs:Levels:Discs" },
        { new RunLevelOptions { Discs = [new() { Disc = "runs.discs.gold", Points = 0 }] }, "Runs:Levels:Discs" },
        { new RunLevelOptions { Discs = [new() { Disc = "runs.discs.bronze", Points = 200 }, new() { Disc = "runs.discs.gold", Points = 200 }] }, "Runs:Levels:Discs" },
        { new RunLevelOptions { Discs = [new() { Disc = "runs.discs.bronze", Points = 100 }, new() { Disc = "runs.discs.bronze", Points = 500 }] }, "Runs:Levels:Discs" },
        { new RunLevelOptions { Discs = [new() { Disc = " ", Points = 100 }, new() { Disc = "runs.discs.gold", Points = 500 }] }, "Runs:Levels:Discs" },
    };

    [Theory]
    [MemberData(nameof(Incoherent))]
    public void UnReglageIncoherent_EstRefuse(RunLevelOptions levels, string expected)
    {
        var problems = RunsOptionsChecks.Problems(new RunsOptions { Levels = levels });

        Assert.Contains(problems, p => p.StartsWith(expected, StringComparison.Ordinal));
    }

    [Fact]
    public void UneEchelleSurMesure_EstAcceptee()
    {
        var levels = new RunLevelOptions { Discs = [new() { Disc = "runs.discs.bronze", Points = 100 }, new() { Disc = "runs.discs.gold", Points = 1000 }] };

        Assert.Empty(RunsOptionsChecks.Problems(new RunsOptions { Levels = levels }));
        Assert.Equal([new RunLevelStep("runs.discs.bronze", 100), new RunLevelStep("runs.discs.gold", 1000)], levels.Ladder);
    }

    [Theory]
    [InlineData(0, 0d)]
    [InlineData(1700, 0.5d)]
    [InlineData(3400, 1d)]
    [InlineData(5000, 1d)]
    public void Share_LaPartDesPointsDansCeuxDuPlusHautDisque(int points, double expected) =>
        Assert.Equal(expected, RunLevelPolicy.Share(points, [new RunLevelStep("runs.discs.scratched", 300), new RunLevelStep("runs.discs.diamond", 3400)]));
}
