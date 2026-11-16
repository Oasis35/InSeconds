using InSeconds.Api.Modules.Gameplay.Domain;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>Le tirage d'une manche de la Série : une tranche de rang Deezer par manche, du plus connu au moins connu, déterministe pour une graine.</summary>
public class RankBandSelectorTests
{
    private readonly RankBandSelector _selector = new(new FisherYatesShuffle());

    private static readonly RunRules Rules = RunsOptions.DefaultRules();

    private static readonly IReadOnlySet<int> None = new HashSet<int>();

    /// <summary>Les morceaux 1 à N, de rang décroissant : le 1 est le plus connu.</summary>
    private static List<RankedTrack> Pool(int count) =>
        Enumerable.Range(1, count).Select(id => new RankedTrack(id, 1_000_000 - id * 1000)).ToList();

    [Fact]
    public void UneManche_TireCinqMorceauxDistincts()
    {
        var round = _selector.SelectRound(Pool(100), Rules, seed: 42, round: 1, None, themeId: null);

        Assert.Equal(5, round.Count);
        Assert.Equal(5, round.Distinct().Count());
    }

    [Fact]
    public void ChaqueManche_TireDansSaTranche_LaPremiereEtantLaPlusConnue()
    {
        // 100 morceaux, 8 tranches de 12 ou 13 : la manche k tire dans la tranche k, les rangs décroissent avec l'identifiant.
        var used = new HashSet<int>();
        for (var round = 1; round <= 8; round++)
        {
            var picked = _selector.SelectRound(Pool(100), Rules, seed: 7, round, used, themeId: null);
            var start = 100 * (round - 1) / 8;
            var end = 100 * round / 8;
            Assert.All(picked, id => Assert.InRange(id, start + 1, end));
            used.UnionWith(picked);
        }
    }

    [Fact]
    public void AuDelaDeLaDerniereTranche_LaDerniereSeRepete_SansReprendreUnMorceau()
    {
        var used = new HashSet<int>();
        for (var round = 1; round <= 12; round++)
            used.UnionWith(_selector.SelectRound(Pool(100), Rules, seed: 3, round, used, themeId: null));

        Assert.Equal(60, used.Count);
    }

    [Fact]
    public void MemeGraine_MemePool_MemeTirage_PeuImporteLOrdreDesCandidats()
    {
        var pool = Pool(100);
        var first = _selector.SelectRound(pool, Rules, seed: 99, round: 3, None, themeId: null);
        var second = new RankBandSelector(new FisherYatesShuffle()).SelectRound([.. pool.AsEnumerable().Reverse()], Rules, seed: 99, round: 3, None, themeId: null);

        Assert.Equal(first, second);
    }

    [Fact]
    public void AutreGraine_AutreTirage() =>
        Assert.NotEqual(
            _selector.SelectRound(Pool(100), Rules, seed: 1, round: 2, None, themeId: null),
            _selector.SelectRound(Pool(100), Rules, seed: 2, round: 2, None, themeId: null));

    [Fact]
    public void UnMorceauSansRang_EstTraiteCommeLeMoinsConnu()
    {
        // 10 morceaux pour 2 tranches de 5 : le morceau sans rang tombe dans la dernière.
        var pool = Pool(9).Append(new RankedTrack(500, null)).ToList();

        var last = _selector.SelectRound(pool, RunsOptions.DefaultRules() with { RankBands = 2 }, seed: 3, round: 2, None, themeId: null);

        Assert.Contains(500, last);
    }

    [Fact]
    public void EgaliteDeRang_DepartageeParLIdentifiant()
    {
        var pool = Enumerable.Range(1, 40).Select(id => new RankedTrack(id, 5000)).ToList();

        var first = _selector.SelectRound(pool, Rules, seed: 11, round: 1, None, themeId: null);

        Assert.All(first, id => Assert.InRange(id, 1, 5));
    }

    [Fact]
    public void UnDoublon_CompteUneFois()
    {
        var pool = Pool(5).Concat(Pool(5)).ToList();

        Assert.Equal(5, _selector.SelectRound(pool, Rules, seed: 5, round: 1, None, themeId: null).Distinct().Count());
    }

    [Fact]
    public void PoolInsuffisant_UneMancheIncomplete_PasDeMancheSiVide()
    {
        Assert.Empty(_selector.SelectRound([], Rules, seed: 1, round: 1, None, themeId: null));
        Assert.True(_selector.SelectRound(Pool(4), Rules, seed: 1, round: 1, None, themeId: null).Count < 5);
    }

    [Fact]
    public void PoolEpuise_LaManchePrendUnRejeuPlutotQueDArreterLaSerie()
    {
        var used = Enumerable.Range(1, 10).ToHashSet();

        var picked = _selector.SelectRound(Pool(10), Rules, seed: 1, round: 3, used, themeId: null);

        Assert.Equal(5, picked.Count);
    }

    [Fact]
    public void LeThemeFiltreLesMorceaux()
    {
        var pool = Enumerable.Range(1, 40).Select(id => new RankedTrack(id, 1_000_000 - id, id % 4 == 0 ? [9] : [1])).ToList();

        var picked = _selector.SelectRound(pool, Rules, seed: 4, round: 2, None, themeId: 9);

        Assert.Equal(5, picked.Count);
        Assert.All(picked, id => Assert.Equal(0, id % 4));
    }

    [Fact]
    public void LesMorceauxDejaTires_NeSontJamaisRepris()
    {
        var used = Enumerable.Range(1, 20).ToHashSet();

        var picked = _selector.SelectRound(Pool(40), Rules, seed: 8, round: 1, used, themeId: null);

        Assert.DoesNotContain(picked, used.Contains);
    }

    [Fact]
    public void ReglesPersonnalisees_UneMancheDeTroisMorceaux()
    {
        var rules = RunsOptions.DefaultRules() with { TracksPerRound = 3 };

        Assert.Equal(3, _selector.SelectRound(Pool(10), rules, seed: 1, round: 1, None, themeId: null).Count);
    }
}
