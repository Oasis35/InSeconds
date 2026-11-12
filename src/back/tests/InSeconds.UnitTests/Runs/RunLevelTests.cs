using InSeconds.Api.Modules.Gameplay.Contracts;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>La politique du niveau : moyenne glissante des scores, provisoire, disque et progression ; le niveau d'un joueur et ses réglages.</summary>
public class RunLevelPolicyTests
{
    private static readonly IReadOnlyList<RunLevelStep> Ladder = [.. new RunLevelOptions().Ladder];

    [Fact]
    public void SansPartie_ZeroPoint() => Assert.Equal(0, RunLevelPolicy.Points([], 10));

    [Fact]
    public void UnePartie_LeNiveauEstSonScore() => Assert.Equal(1380, RunLevelPolicy.Points([1380], 10));

    [Fact]
    public void LaMoyenne_EstArrondieAuPlusProche()
    {
        Assert.Equal(1501, RunLevelPolicy.Points([1000, 2001], 10));
        Assert.Equal(1500, RunLevelPolicy.Points([1000, 2000], 10));
    }

    [Fact]
    public void LaFenetre_NeGardeQueLesDernieresParties()
    {
        // Les 3 dernières : 100, 200, 300 ; les premières ne comptent plus.
        Assert.Equal(200, RunLevelPolicy.Points([5000, 5000, 100, 200, 300], 3));
        Assert.Equal(300, RunLevelPolicy.Points([100, 200, 300], 1));
    }

    [Fact]
    public void UneFenetreInvalide_EstRefusee() => Assert.Throws<ArgumentOutOfRangeException>(() => RunLevelPolicy.Points([1], 0));

    [Fact]
    public void LeNiveau_EstProvisoire_TantQueLeJoueurAMoinsDeParties()
    {
        Assert.True(RunLevelPolicy.IsProvisional(0, 3));
        Assert.True(RunLevelPolicy.IsProvisional(2, 3));
        Assert.False(RunLevelPolicy.IsProvisional(3, 3));
        Assert.False(RunLevelPolicy.IsProvisional(0, 0));
    }

    [Theory]
    [InlineData(0, "runs.discs.scratched", "runs.discs.wax", 300, 0)]
    [InlineData(299, "runs.discs.scratched", "runs.discs.wax", 1, 99)]
    [InlineData(300, "runs.discs.wax", "runs.discs.bronze", 400, 0)]
    [InlineData(1380, "runs.discs.silver", "runs.discs.gold", 220, 56)]
    [InlineData(1599, "runs.discs.silver", "runs.discs.gold", 1, 99)]
    [InlineData(1600, "runs.discs.gold", "runs.discs.platinum", 600, 0)]
    [InlineData(2800, "runs.discs.double_platinum", "runs.discs.diamond", 600, 0)]
    public void LeDisque_ELaProgression(int points, string disc, string next, int toNext, int progress)
    {
        var standing = RunLevelPolicy.Standing(points, Ladder);

        Assert.Equal((disc, next, toNext, progress), (standing.Current.Disc, standing.Next!.Disc, standing.PointsToNext, standing.ProgressPercent));
    }

    [Fact]
    public void AuDernierDisque_PasDeSuivant_EtLaJaugeEstPleine()
    {
        var standing = RunLevelPolicy.Standing(9999, Ladder);

        Assert.Equal("runs.discs.diamond", standing.Current.Disc);
        Assert.Null(standing.Next);
        Assert.Null(standing.PointsToNext);
        Assert.Equal(100, standing.ProgressPercent);
    }

    [Fact]
    public void UneEchelleVide_EstRefusee() => Assert.Throws<ArgumentException>(() => RunLevelPolicy.Standing(0, []));

    [Fact]
    public void LesPointsNegatifs_RestentAuPremierDisque()
    {
        var standing = RunLevelPolicy.Standing(-5, Ladder);

        Assert.Equal("runs.discs.scratched", standing.Current.Disc);
        Assert.Equal(0, standing.ProgressPercent);
    }
}

public class RunLevelTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 11, 8, 0, 0, TimeSpan.Zero);
    private static int _nextId = 100;

    /// <summary>Une partie finie : <paramref name="roundsFound"/> manches entièrement trouvées (500, 665, 835, 1000), puis la suivante ratée (perdue) ; 4 : gagnée.</summary>
    private static RunSession Finished(Guid player, int roundsFound)
    {
        var rules = RunsOptions.DefaultRules();
        var challenge = RunChallenge.Create("K7Q2M9", 1, rules,
            Enumerable.Range(1, rules.TrackCount).Select(id => new PlannedTrack(id, (id - 1) / 5 + 1, rules.MultiplierOf((id - 1) / 5 + 1))).ToList(), null, Now);
        var session = RunSession.Start(0, player, Now);
        typeof(RunSession).GetProperty(nameof(RunSession.Id))!.SetValue(session, _nextId++);
        while (session.IsPending)
        {
            var round = challenge.Tracks.First(t => t.Position == session.NextPosition).Round;
            var found = round <= roundsFound;
            session.Answer(challenge, new RoundOutcome(found, found, 10m, 0), new ArtistTitleScoring(), Now);
        }

        return session;
    }

    [Fact]
    public void LaPremierePartie_FixeLeNiveauSurSonScore_EtLeGainEstCeScore()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);
        var session = Finished(player, 4);

        level.Record(session, 10, Now);

        Assert.Equal((3000, 1, 3000), (level.Points, level.RunsPlayed, level.LastDelta));
        Assert.Equal(3000, level.DeltaOf(session.Id));
    }

    [Fact]
    public void UnMauvaisRun_FaitBaisserLeNiveau_JusquAuNiveauMoyen()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);
        level.Record(Finished(player, 4), 10, Now);
        var bad = Finished(player, 0);

        level.Record(bad, 10, Now);

        Assert.Equal(0, bad.TotalScore);
        Assert.Equal(1500, level.Points);
        Assert.Equal(-1500, level.DeltaOf(bad.Id));
        Assert.Equal(2, level.RunsPlayed);
    }

    [Fact]
    public void LesPointsMontentEtDescendent_SurLaFenetre()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);
        level.Record(Finished(player, 0), 2, Now);
        level.Record(Finished(player, 4), 2, Now);
        Assert.Equal(1500, level.Points);

        // La fenêtre de 2 : la première partie (0) sort, il reste 3000 et 3000.
        level.Record(Finished(player, 4), 2, Now);
        Assert.Equal(3000, level.Points);
        Assert.Equal(1500, level.LastDelta);
    }

    [Fact]
    public void UnePartieDejaComptee_NeLEstPasDeuxFois()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);
        var session = Finished(player, 4);
        level.Record(session, 10, Now);

        level.Record(session, 10, Now);

        Assert.Equal(1, level.RunsPlayed);
        Assert.Equal([3000], level.RecentScores);
    }

    [Fact]
    public void LHistorique_EstBorne()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);

        for (var i = 0; i < RunLevelPolicy.MaxStoredScores + 5; i++)
            level.Record(Finished(player, 1), 10, Now);

        Assert.Equal(RunLevelPolicy.MaxStoredScores, level.RecentScores.Length);
        Assert.Equal(RunLevelPolicy.MaxStoredScores + 5, level.RunsPlayed);
    }

    [Fact]
    public void LeGain_EstVide_PourUneAutrePartie()
    {
        var player = Guid.NewGuid();
        var level = RunLevel.Start(player, Now);
        level.Record(Finished(player, 4), 10, Now);

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

        Assert.Throws<InvalidOperationException>(() => level.Record(pending, 10, Now));
        Assert.Throws<InvalidOperationException>(() => level.Record(abandoned, 10, Now));
    }

    [Fact]
    public void LaPartieDUnAutreJoueur_EstRefusee() =>
        Assert.Throws<ArgumentException>(() => RunLevel.Start(Guid.NewGuid(), Now).Record(Finished(Guid.NewGuid(), 4), 10, Now));
}

public class RunLevelOptionsTests
{
    [Fact]
    public void LesDefauts_SontCoherents_EtLaListeSansValeurInitiale()
    {
        var options = new RunsOptions();

        Assert.Empty(RunsOptionsChecks.Problems(options));
        Assert.Null(options.Levels.Discs);
        Assert.Equal(8, options.Levels.EffectiveDiscs.Count);
        Assert.Equal(
            ["scratched", "wax", "bronze", "silver", "gold", "platinum", "double_platinum", "diamond"],
            options.Levels.EffectiveDiscs.Select(d => d.Disc["runs.discs.".Length..]));
        Assert.Equal((10, 3), (options.Levels.Window, options.Levels.ProvisionalRuns));
    }

    public static TheoryData<RunLevelOptions, string> Incoherent => new()
    {
        { new RunLevelOptions { Window = 0 }, "Runs:Levels:Window" },
        { new RunLevelOptions { Window = 51 }, "Runs:Levels:Window" },
        { new RunLevelOptions { ProvisionalRuns = -1 }, "Runs:Levels:ProvisionalRuns" },
        { new RunLevelOptions { ProvisionalRuns = 11 }, "Runs:Levels:ProvisionalRuns" },
        { new RunLevelOptions { Discs = [] }, "Runs:Levels:Discs" },
        { new RunLevelOptions { Discs = [new() { Disc = "runs.discs.gold", Points = 0 }] }, "Runs:Levels:Discs" },
        { new RunLevelOptions { Discs = [new() { Disc = "runs.discs.wax", Points = 100 }, new() { Disc = "runs.discs.gold", Points = 200 }] }, "Runs:Levels:Discs" },
        { new RunLevelOptions { Discs = [new() { Disc = "runs.discs.wax", Points = 0 }, new() { Disc = "runs.discs.gold", Points = 0 }] }, "Runs:Levels:Discs" },
        { new RunLevelOptions { Discs = [new() { Disc = "runs.discs.wax", Points = 0 }, new() { Disc = "runs.discs.wax", Points = 50 }] }, "Runs:Levels:Discs" },
        { new RunLevelOptions { Discs = [new() { Disc = " ", Points = 0 }, new() { Disc = "runs.discs.gold", Points = 50 }] }, "Runs:Levels:Discs" },
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
        var levels = new RunLevelOptions { Window = 5, ProvisionalRuns = 0, Discs = [new() { Disc = "runs.discs.wax", Points = 0 }, new() { Disc = "runs.discs.gold", Points = 1000 }] };

        Assert.Empty(RunsOptionsChecks.Problems(new RunsOptions { Levels = levels }));
        Assert.Equal([new RunLevelStep("runs.discs.wax", 0), new RunLevelStep("runs.discs.gold", 1000)], levels.Ladder);
    }
}
