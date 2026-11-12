using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

public class RunHitsTests
{
    private static readonly RunLevelStep[] Ladder =
        [new("runs.discs.scratched", 0), new("runs.discs.gold", 1600), new("runs.discs.diamond", 3400)];

    /// <summary>Une partie de 4 manches de 5 morceaux ; <paramref name="found"/> : les morceaux trouvés, dans l'ordre (les autres ne sont pas joués).</summary>
    private static RunHitRun Run(
        int score, bool won = false, bool[]? found = null, Dictionary<int, RunDifficulty>? difficulties = null, bool card = false,
        Dictionary<int, int>? friend = null, int[]? neutralized = null)
    {
        var answers = (found ?? []).Select((f, i) => new RunHitAnswer(i + 1, i / 5 + 1, f, neutralized?.Contains(i + 1) ?? false)).ToList();
        return new RunHitRun(won, score, 4, 5, difficulties ?? [], answers, card, friend);
    }

    private static Dictionary<string, RunHit> Evaluate(bool friendPlayed = false, params RunHitRun[] runs) =>
        RunHits.Evaluate(new RunHitFacts(runs, friendPlayed), window: 10, provisionalRuns: 3, Ladder).ToDictionary(h => h.Key);

    private static string[] Earned(Dictionary<string, RunHit> hits) => [.. hits.Values.Where(h => h.Earned).Select(h => h.Key)];

    [Fact]
    public void SansPartie_AucunHit_SeizeDansLOrdreDeLEcran()
    {
        var hits = RunHits.Evaluate(new RunHitFacts([], false), 10, 3, Ladder);

        Assert.Equal(16, hits.Count);
        Assert.Equal(RunHits.FirstSetlist, hits[0].Key);
        Assert.Equal(RunHits.LevelDiamond, hits[^1].Key);
        Assert.DoesNotContain(hits, h => h.Earned);
        Assert.Equal((0, 10), (hits.Single(h => h.Key == RunHits.TenSetlists).Progress, hits.Single(h => h.Key == RunHits.TenSetlists).Target));
    }

    [Fact]
    public void UnePartiePerdue_DonneLaPremiereSetlist_SeulementElle()
    {
        Assert.Equal([RunHits.FirstSetlist], Earned(Evaluate(false, Run(200, found: [true, false, false, false, false]))));
    }

    [Fact]
    public void LeRecord_NEstBattuQuAPartirDeLaDeuxiemePartie_EtStrictement()
    {
        Assert.False(Evaluate(false, Run(500), Run(500)).GetValueOrDefault(RunHits.FirstRecord)!.Earned);
        Assert.True(Evaluate(false, Run(500), Run(400), Run(501))[RunHits.FirstRecord].Earned);
    }

    [Fact]
    public void LesCompteurs_AvancentEtPlafonnent()
    {
        var hits = Evaluate(false, [.. Enumerable.Range(0, 12).Select(_ => Run(100))]);

        Assert.Equal((true, 10, 10), (hits[RunHits.TenSetlists].Earned, hits[RunHits.TenSetlists].Progress, hits[RunHits.TenSetlists].Target));
        Assert.Equal((false, 12, 50), (hits[RunHits.FiftySetlists].Earned, hits[RunHits.FiftySetlists].Progress, hits[RunHits.FiftySetlists].Target));
    }

    [Fact]
    public void MancheParfaite_CinqMorceauxTrouves_SansMorceauRetire()
    {
        bool[] perfect = [true, true, true, true, true];
        Assert.True(Evaluate(false, Run(500, found: perfect))[RunHits.PerfectRound].Earned);
        Assert.False(Evaluate(false, Run(400, found: [true, true, true, true, false]))[RunHits.PerfectRound].Earned);
        Assert.False(Evaluate(false, Run(400, found: perfect, neutralized: [3]))[RunHits.PerfectRound].Earned);
        Assert.False(Evaluate(false, Run(400, found: [true, true, true, true]))[RunHits.PerfectRound].Earned);
    }

    [Fact]
    public void DixDAffilee_UnMorceauRetireNeCassePasLaSerie_UnRateOui()
    {
        bool[] eleven = [.. Enumerable.Repeat(true, 11)];
        Assert.True(Evaluate(false, Run(1500, found: eleven, neutralized: [4]))[RunHits.TenInARow].Earned);

        bool[] broken = [true, true, true, true, true, false, true, true, true, true, true, true, true, true, true];
        Assert.False(Evaluate(false, Run(1500, found: broken))[RunHits.TenInARow].Earned);
        Assert.Equal(9, RunHits.LongestStreak(Run(1500, found: broken)));
    }

    [Fact]
    public void Melomane_PremiereManche_Boss_EtDisqueDOr()
    {
        var oneRisky = Run(900, difficulties: new() { [2] = RunDifficulty.Risky });
        Assert.Equal([RunHits.FirstSetlist, RunHits.FirstRiskyRound], Earned(Evaluate(false, oneRisky)));

        var boss = Run(3000, won: true, difficulties: new() { [2] = RunDifficulty.Safe, [4] = RunDifficulty.Risky });
        var withBoss = Evaluate(false, boss);
        Assert.True(withBoss[RunHits.BossBeaten].Earned);
        Assert.True(withBoss[RunHits.SetlistWon].Earned);
        Assert.False(withBoss[RunHits.GoldInRisky].Earned);

        var lostOnBoss = Run(2000, difficulties: new() { [4] = RunDifficulty.Risky });
        Assert.False(Evaluate(false, lostOnBoss)[RunHits.BossBeaten].Earned);

        var allRisky = Run(3500, won: true, difficulties: new() { [2] = RunDifficulty.Risky, [3] = RunDifficulty.Risky, [4] = RunDifficulty.Risky });
        Assert.True(Evaluate(false, allRisky)[RunHits.GoldInRisky].Earned);
    }

    [Fact]
    public void Duel_GagneSurLesMorceauxJoues_EgaliteNeCompte_CinqPourLeSecond()
    {
        var ahead = Run(300, found: [true, true, true], friend: new() { [1] = 100, [2] = 100, [3] = 50, [4] = 900 });
        var tied = Run(250, found: [true, true, true], friend: new() { [1] = 100, [2] = 100, [3] = 50 });

        var one = Evaluate(false, ahead, tied);
        Assert.True(one[RunHits.DuelWon].Earned);
        Assert.Equal((false, 1, 5), (one[RunHits.FiveDuels].Earned, one[RunHits.FiveDuels].Progress, one[RunHits.FiveDuels].Target));
        Assert.False(Evaluate(false, tied)[RunHits.DuelWon].Earned);
        Assert.True(Evaluate(false, ahead, ahead, ahead, ahead, ahead)[RunHits.FiveDuels].Earned);
    }

    [Fact]
    public void CarteGagnee_EtAmiQuiAJoueMaSetlist()
    {
        Assert.True(Evaluate(false, Run(100, card: true))[RunHits.FirstCard].Earned);
        Assert.True(Evaluate(true)[RunHits.FriendPlayed].Earned);
    }

    [Fact]
    public void Niveau_JugeSurLePlusHautAtteint_JamaisProvisoire()
    {
        // Deux parties : encore provisoire.
        Assert.False(Evaluate(false, Run(3000), Run(3000))[RunHits.LevelGold].Earned);
        // Trois parties à 2000 de moyenne, puis une chute : l'Or reste acquis.
        var hits = Evaluate(false, Run(2000), Run(2000), Run(2000), Run(0), Run(0), Run(0), Run(0), Run(0));
        Assert.True(hits[RunHits.LevelGold].Earned);
        Assert.False(hits[RunHits.LevelDiamond].Earned);
        Assert.Equal(2000, RunHits.PeakLevel([Run(2000), Run(2000), Run(2000), Run(0)], 10, 3));
    }

    [Fact]
    public void UnDisqueAbsentDeLEchelle_NeSObtientPas()
    {
        var hits = RunHits.Evaluate(new RunHitFacts([Run(9000), Run(9000), Run(9000)], false), 10, 3, [new("runs.discs.scratched", 0)]);

        Assert.False(hits.Single(h => h.Key == RunHits.LevelGold).Earned);
    }
}
