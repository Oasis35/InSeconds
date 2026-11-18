using InSeconds.Api.Modules.Gameplay.Domain;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>La diversité du tirage : des quantités (part du pool, part des thèmes), jamais une durée ni un blocage.</summary>
public class RunDiversityTests
{
    [Fact]
    public void LesMorceauxAEviter_SontLesPlusRecents_JusquAuneParDuPool()
    {
        var heard = Enumerable.Range(1, 100).ToList();

        var avoid = RunDiversity.TracksToAvoid(heard, poolSize: 50, poolPercent: 40);

        Assert.Equal(Enumerable.Range(1, 20), avoid);
    }

    [Fact]
    public void LaMemoire_SAdapteALaTailleDuPool()
    {
        var heard = Enumerable.Range(1, 100).ToList();

        Assert.Equal(4, RunDiversity.TracksToAvoid(heard, poolSize: 10, poolPercent: 40).Count);
        Assert.Equal(40, RunDiversity.TracksToAvoid(heard, poolSize: 100, poolPercent: 40).Count);
    }

    [Fact]
    public void ZeroPourcent_NeDitRienEviter_EtUnDoublonNeCompteQuUneFois()
    {
        Assert.Empty(RunDiversity.TracksToAvoid([1, 2, 3], poolSize: 50, poolPercent: 0));
        Assert.Equal([1, 2], RunDiversity.TracksToAvoid([1, 1, 2, 2], poolSize: 5, poolPercent: 40));
    }

    [Fact]
    public void LesThemes_LesPlusRecentsSontEvites_TantQuIlEnResteLaMoitie()
    {
        var eligible = Enumerable.Range(1, 8).ToList();

        var avoid = RunDiversity.ThemesToAvoid([8, 7, 6, 5, 4, 3, 2, 1], eligible, keepPercent: 50);

        Assert.Equal([8, 7, 6, 5], avoid);
    }

    [Fact]
    public void PeuDeThemes_JamaisMoinsDeTroisEnLice()
    {
        Assert.Empty(RunDiversity.ThemesToAvoid([1, 2, 3], [1, 2, 3], keepPercent: 50));
        Assert.Equal([1], RunDiversity.ThemesToAvoid([1, 2, 3], [1, 2, 3, 4], keepPercent: 50));
    }

    [Fact]
    public void UnThemeJoueMaisAbsentDesEligibles_NeCompteNiNeBloque()
    {
        Assert.Equal([2], RunDiversity.ThemesToAvoid([99, 2], [1, 2, 3, 4], keepPercent: 50));
    }

    [Fact]
    public void LaSelection_PrefereLesMorceauxPasEntendus_DansLaTranche()
    {
        var selector = new RankBandSelector(new FisherYatesShuffle());
        var pool = Enumerable.Range(1, 80).Select(id => new RankedTrack(id, 1_000_000 - id * 1000)).ToList();
        var rules = TestRules.Legacy() with { TracksPerRound = 3 };
        // La première tranche (8 morceaux : 1 à 10) : 1 à 5 entendus récemment.
        var avoid = new[] { 1, 2, 3, 4, 5 };

        var picked = selector.SelectRound(pool, rules, seed: 5, round: 1, new HashSet<int>(), themeId: null, avoid);

        Assert.Equal(3, picked.Count);
        Assert.All(picked, id => Assert.InRange(id, 6, 10));
    }

    [Fact]
    public void TrancheTropPetite_LesMorceauxEntendusLePlusAnciennementReviennentEnPremier()
    {
        var selector = new RankBandSelector(new FisherYatesShuffle());
        var pool = Enumerable.Range(1, 80).Select(id => new RankedTrack(id, 1_000_000 - id * 1000)).ToList();
        var rules = TestRules.Legacy() with { TracksPerRound = 3 };
        // Toute la première tranche (1 à 10) est à éviter, 10 étant le plus ancien : on relâche par lui.
        var avoid = Enumerable.Range(1, 10).ToList();

        var picked = selector.SelectRound(pool, rules, seed: 5, round: 1, new HashSet<int>(), themeId: null, avoid);

        Assert.Equal([10, 9, 8], picked);
    }

    [Fact]
    public void TousLesMorceauxAEviter_LaManche_SeTireQuandMeme()
    {
        var selector = new RankBandSelector(new FisherYatesShuffle());
        var pool = Enumerable.Range(1, 12).Select(id => new RankedTrack(id, 1_000_000 - id)).ToList();
        var rules = TestRules.Legacy() with { TracksPerRound = 3 };

        var picked = selector.SelectRound(pool, rules, seed: 2, round: 2, new HashSet<int>(), themeId: null, Enumerable.Range(1, 12).ToList());

        Assert.Equal(3, picked.Distinct().Count());
    }

    [Fact]
    public void SansMemoire_LeTirageNeChangePas()
    {
        var selector = new RankBandSelector(new FisherYatesShuffle());
        var pool = Enumerable.Range(1, 80).Select(id => new RankedTrack(id, 1_000_000 - id * 1000)).ToList();
        var rules = TestRules.Legacy();

        Assert.Equal(
            selector.SelectRound(pool, rules, seed: 9, round: 3, new HashSet<int>(), themeId: null),
            selector.SelectRound(pool, rules, seed: 9, round: 3, new HashSet<int>(), themeId: null, []));
    }

    [Fact]
    public void LaMemoire_VientDesPartiesLesPlusRecentesD_Abord_SansDoublon_EtLesThemesDesRegles()
    {
        var rules = TestRules.Legacy() with { Themes = [new RunRoundTheme(2, 77, "Rock"), new RunRoundTheme(3, 88, "Jazz")] };
        var heard = new[]
        {
            new HeardTrack(SessionId: 1, ChallengeId: 10, Position: 1, TrackId: 100, Round: 1),
            new HeardTrack(1, 10, 2, 101, 1),
            new HeardTrack(2, 11, 1, 100, 1),
            new HeardTrack(2, 11, 6, 200, 2),
            new HeardTrack(2, 11, 9, 300, 3),
        };

        var history = RunHeardHistory.From(heard, new Dictionary<int, RunRules> { [10] = rules, [11] = rules });

        Assert.Equal([300, 200, 100, 101], history.TrackIds);
        Assert.Equal([88, 77], history.ThemeIds);
    }

    [Fact]
    public void LaMemoire_SansPartie_EstVide()
    {
        var history = RunHeardHistory.From([], new Dictionary<int, RunRules>());

        Assert.Empty(history.TrackIds);
        Assert.Empty(history.ThemeIds);
    }
}
