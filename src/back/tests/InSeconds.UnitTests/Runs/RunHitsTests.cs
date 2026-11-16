using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

public class RunHitsTests
{
    private static readonly RunLevelStep[] Ladder =
        [new("runs.discs.scratched", 0), new("runs.discs.gold", 1600), new("runs.discs.diamond", 3400)];

    /// <summary>Une partie finie ; <paramref name="found"/> : les morceaux trouvés, dans l'ordre (les autres ne sont pas joués).</summary>
    private static RunHitRun Run(int score, bool[]? found = null, Dictionary<int, int>? friend = null, int[]? neutralized = null)
    {
        var answers = (found ?? []).Select((f, i) => new RunHitAnswer(i + 1, i / 5 + 1, f, neutralized?.Contains(i + 1) ?? false)).ToList();
        return new RunHitRun(score, 5, answers, friend);
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
    public void UnePartieFinie_DonneLaPremiereSetlist_SeulementElle()
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
    public void AmiQuiAJoueMaSetlist() =>
        Assert.True(Evaluate(true)[RunHits.FriendPlayed].Earned);

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

    private static RunHitAnswer Ans(int position, bool found, decimal listen = 10m, bool failed = false, bool neutralized = false) =>
        new(position, (position - 1) / 5 + 1, found, neutralized, listen, failed);

    private static RunHitRun Answers(int score, IEnumerable<RunHitAnswer> answers, Dictionary<int, int>? friend = null, int[]? mystery = null) =>
        new(score, 5, [.. answers], friend, mystery is null ? null : mystery.ToHashSet());

    [Fact]
    public void OreilleDOr_UnMorceauTrouveEnEntierA0Virgule5Seconde()
    {
        Assert.True(Evaluate(false, Answers(1200, [Ans(1, true, 0.5m)]))[RunHits.EarGold].Earned);
        Assert.False(Evaluate(false, Answers(1200, [Ans(1, true, 1m)]))[RunHits.EarGold].Earned);
        Assert.False(Evaluate(false, Answers(0, [Ans(1, false, 0.5m, failed: true)]))[RunHits.EarGold].Earned);
    }

    [Fact]
    public void SansUneEgratignure_TroisManchesDeSuiteSansVieLaissee()
    {
        var clean = Enumerable.Range(1, 15).Select(p => Ans(p, true));
        Assert.True(Evaluate(false, Answers(100, clean))[RunHits.NoScratch].Earned);

        // Une erreur en manche 2 coupe la série : 1 puis 1 manche propres, jamais 3 de suite.
        var broken = Enumerable.Range(1, 15).Select(p => p == 7 ? Ans(p, false, failed: true) : Ans(p, true));
        Assert.False(Evaluate(false, Answers(100, broken))[RunHits.NoScratch].Earned);

        // Une moitié juste ne coûte pas de vie, une manche incomplète ne compte pas.
        var halves = Enumerable.Range(1, 15).Select(p => Ans(p, false));
        Assert.True(Evaluate(false, Answers(100, halves))[RunHits.NoScratch].Earned);
        Assert.False(Evaluate(false, Answers(100, Enumerable.Range(1, 14).Select(p => Ans(p, true))))[RunHits.NoScratch].Earned);
    }

    [Fact]
    public void Marathon_CompteLesManchesJoueesEnEntier_EtPlafonneA10()
    {
        var hits = Evaluate(false, Answers(100, Enumerable.Range(1, 23).Select(p => Ans(p, true))));
        Assert.Equal((false, 4, 10), (hits[RunHits.Marathon].Earned, hits[RunHits.Marathon].Progress, hits[RunHits.Marathon].Target));

        var done = Evaluate(false, Answers(100, Enumerable.Range(1, 55).Select(p => Ans(p, true))))[RunHits.Marathon];
        Assert.Equal((true, 10, 10), (done.Earned, done.Progress, done.Target));
    }

    [Fact]
    public void MystereResolu_UneMancheMystereTrouveeEnEntier()
    {
        var round2Found = Enumerable.Range(1, 10).Select(p => Ans(p, true));
        Assert.True(Evaluate(false, Answers(100, round2Found, mystery: [2]))[RunHits.MysterySolved].Earned);
        Assert.False(Evaluate(false, Answers(100, round2Found))[RunHits.MysterySolved].Earned);

        var missed = Enumerable.Range(1, 10).Select(p => p == 8 ? Ans(p, false, failed: true) : Ans(p, true));
        Assert.False(Evaluate(false, Answers(100, missed, mystery: [2]))[RunHits.MysterySolved].Earned);

        // Un morceau retiré ne gâche pas la manche.
        var withdrawn = Enumerable.Range(1, 10).Select(p => p == 8 ? Ans(p, false, neutralized: true) : Ans(p, true));
        Assert.True(Evaluate(false, Answers(100, withdrawn, mystery: [2]))[RunHits.MysterySolved].Earned);
    }

    [Fact]
    public void FantomeBattuEnRetard_PlusLoinQueLAmi_EtPlusDePointsQueSonTotal()
    {
        var friend = new Dictionary<int, int> { [1] = 100, [2] = 100, [3] = 100 };
        // Il a joué jusqu'au morceau 5 (l'ami s'est arrêté au 3) et fait 500 > 300.
        Assert.True(Evaluate(false, Answers(500, Enumerable.Range(1, 5).Select(p => Ans(p, true)), friend))[RunHits.LateGhost].Earned);
        // Pas plus loin que l'ami : pas de Hit, même avec plus de points.
        Assert.False(Evaluate(false, Answers(500, Enumerable.Range(1, 3).Select(p => Ans(p, true)), friend))[RunHits.LateGhost].Earned);
        // Plus loin mais moins de points que le total de l'ami.
        Assert.False(Evaluate(false, Answers(250, Enumerable.Range(1, 5).Select(p => Ans(p, false)), friend))[RunHits.LateGhost].Earned);
        // Sur sa propre playlist (pas d'ami) : rien.
        Assert.False(Evaluate(false, Answers(500, Enumerable.Range(1, 5).Select(p => Ans(p, true))))[RunHits.LateGhost].Earned);
    }
}
