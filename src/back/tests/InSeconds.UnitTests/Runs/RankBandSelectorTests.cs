using InSeconds.Api.Modules.Gameplay.Domain;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

/// <summary>Le tirage d'un défi de run : une tranche de rang Deezer par manche, du plus connu au moins connu, déterministe pour une graine.</summary>
public class RankBandSelectorTests
{
    private readonly RankBandSelector _selector = new(new FisherYatesShuffle());

    private static readonly RunRules Rules = RunsOptions.DefaultRules();

    /// <summary>Les morceaux 1 à N, de rang décroissant : le 1 est le plus connu.</summary>
    private static List<RankedTrack> Pool(int count) =>
        Enumerable.Range(1, count).Select(id => new RankedTrack(id, 1_000_000 - id * 1000)).ToList();

    [Fact]
    public void Tire_QuatreManchesDeCinqMorceauxDistincts()
    {
        var selection = _selector.Select(Pool(100), Rules, seed: 42);

        Assert.True(selection.IsSufficient);
        Assert.Equal((100, 20), (selection.EligibleCount, selection.Requested));
        Assert.Equal(20, selection.Tracks.Count);
        Assert.Equal(20, selection.Tracks.Select(t => t.TrackId).Distinct().Count());
        Assert.Equal([1, 2, 3, 4], selection.Tracks.Select(t => t.Round).Distinct());
        Assert.All(Enumerable.Range(1, 4), round => Assert.Equal(5, selection.Tracks.Count(t => t.Round == round)));
    }

    [Fact]
    public void ChaqueManche_TireDansSaTranche_LaPremiereEtantLaPlusConnue()
    {
        // 100 morceaux, 4 tranches de 25 : les rangs décroissent avec l'identifiant.
        var selection = _selector.Select(Pool(100), Rules, seed: 7);

        foreach (var track in selection.Tracks)
        {
            var band = (track.TrackId - 1) / 25 + 1;
            Assert.Equal(band, track.Round);
        }
    }

    [Fact]
    public void Multiplicateurs_VontDeUnADeux_LesMemesPourToutUneManche()
    {
        var selection = _selector.Select(Pool(100), Rules, seed: 1);

        Assert.Equal([1.00m, 1.33m, 1.67m, 2.00m], selection.Tracks.Select(t => t.Multiplier).Distinct());
        Assert.All(selection.Tracks.GroupBy(t => t.Round), group => Assert.Single(group.Select(t => t.Multiplier).Distinct()));
    }

    [Fact]
    public void MemeGraine_MemePool_MemeTirage_PeuImporteLOrdreDesCandidats()
    {
        var pool = Pool(100);
        var first = _selector.Select(pool, Rules, seed: 99);
        var second = new RankBandSelector(new FisherYatesShuffle()).Select([.. pool.AsEnumerable().Reverse()], Rules, seed: 99);

        Assert.Equal(first.Tracks, second.Tracks);
    }

    [Fact]
    public void AutreGraine_AutreTirage() =>
        Assert.NotEqual(_selector.Select(Pool(100), Rules, seed: 1).Tracks, _selector.Select(Pool(100), Rules, seed: 2).Tracks);

    [Fact]
    public void UnMorceauSansRang_EstDansLaTrancheLaMoinsConnue()
    {
        // 20 morceaux pour 20 places : chaque tranche est prise en entier, le morceau sans rang tombe dans la dernière.
        var pool = Pool(19).Append(new RankedTrack(500, null)).ToList();

        var selection = _selector.Select(pool, Rules, seed: 3);

        Assert.Equal(4, selection.Tracks.Single(t => t.TrackId == 500).Round);
    }

    [Fact]
    public void EgaliteDeRang_DepartageeParLIdentifiant()
    {
        var pool = Enumerable.Range(1, 40).Select(id => new RankedTrack(id, 5000)).ToList();

        var selection = _selector.Select(pool, Rules, seed: 11);

        Assert.All(selection.Tracks, t => Assert.Equal((t.TrackId - 1) / 10 + 1, t.Round));
    }

    [Fact]
    public void UnDoublon_CompteUneFois()
    {
        var pool = Pool(19).Concat(Pool(19)).ToList();

        var selection = _selector.Select(pool, Rules, seed: 5);

        Assert.False(selection.IsSufficient);
        Assert.Equal(19, selection.EligibleCount);
    }

    [Fact]
    public void PoolInsuffisant_SelectionVide()
    {
        var selection = _selector.Select(Pool(19), Rules, seed: 1);

        Assert.False(selection.IsSufficient);
        Assert.Empty(selection.Tracks);
        Assert.Equal((19, 20), (selection.EligibleCount, selection.Requested));
    }

    [Fact]
    public void PoolJusteSuffisant_UtiliseTousLesMorceaux()
    {
        var selection = _selector.Select(Pool(20), Rules, seed: 1);

        Assert.True(selection.IsSufficient);
        Assert.Equal(Enumerable.Range(1, 20), selection.Tracks.Select(t => t.TrackId).Order());
    }

    [Fact]
    public void Pool21_LesTranchesInegales_ResterSuffisantes()
    {
        // 23 morceaux, 4 manches de 5 : les tranches ont 5, 6, 6 et 6 morceaux, toutes assez grandes.
        var selection = _selector.Select(Pool(23), Rules, seed: 1);

        Assert.True(selection.IsSufficient);
        Assert.Equal(20, selection.Tracks.Count);
    }

    [Fact]
    public void ReglesPersonnalisees_UneMancheDeTroisMorceaux()
    {
        var rules = new RunRules(1, 3, 10m, [50], 1.5m, 3m);

        var selection = _selector.Select(Pool(10), rules, seed: 1);

        Assert.Equal(3, selection.Tracks.Count);
        Assert.All(selection.Tracks, t => Assert.Equal((1, 1.5m), (t.Round, t.Multiplier)));
    }
}
