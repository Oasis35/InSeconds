using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Gameplay.Domain;

namespace InSeconds.UnitTests.Daily;

/// <summary>Le tirage du défi : hors cooldown, déterministe pour une graine, indépendant de l'ordre des candidats.</summary>
public class CooldownSeededSelectorTests
{
    private static readonly IReadOnlySet<int> NoCooldown = new HashSet<int>();

    private readonly CooldownSeededSelector _selector = new(new FisherYatesShuffle());

    private static IEnumerable<int> Pool(int count) => Enumerable.Range(1, count);

    [Fact]
    public void Tire_LeNombreDemande_DeMorceauxDistincts_ParmiLesCandidats()
    {
        var selection = _selector.Select(Pool(50), NoCooldown, 5, seed: 20_000);

        Assert.True(selection.IsSufficient);
        Assert.Equal((50, 5), (selection.EligibleCount, selection.Requested));
        Assert.Equal(5, selection.TrackIds.Count);
        Assert.Equal(5, selection.TrackIds.Distinct().Count());
        Assert.All(selection.TrackIds, id => Assert.InRange(id, 1, 50));
    }

    [Fact]
    public void MemeGraine_MemePool_MemeTirage()
    {
        var first = _selector.Select(Pool(50), NoCooldown, 5, seed: 20_000);
        var second = new CooldownSeededSelector(new FisherYatesShuffle()).Select(Pool(50), NoCooldown, 5, seed: 20_000);

        Assert.Equal(first.TrackIds, second.TrackIds);
    }

    [Fact]
    public void AutreGraine_AutreTirage()
    {
        Assert.NotEqual(
            _selector.Select(Pool(50), NoCooldown, 5, seed: 20_000).TrackIds,
            _selector.Select(Pool(50), NoCooldown, 5, seed: 20_001).TrackIds);
    }

    [Fact]
    public void LOrdreDesCandidats_NeChangePasLeTirage()
    {
        // La base ne garantit aucun ordre : le défi ne doit dépendre que du pool et de la graine.
        var ordered = _selector.Select(Pool(50), NoCooldown, 5, seed: 20_000);
        var reversed = _selector.Select(Pool(50).Reverse(), NoCooldown, 5, seed: 20_000);
        var shuffled = _selector.Select(Pool(50).OrderBy(id => id * 7919 % 50), NoCooldown, 5, seed: 20_000);

        Assert.Equal(ordered.TrackIds, reversed.TrackIds);
        Assert.Equal(ordered.TrackIds, shuffled.TrackIds);
    }

    [Fact]
    public void UnCandidatEnDouble_CompteUneFois()
    {
        var selection = _selector.Select([1, 1, 2, 2, 3], NoCooldown, 3, seed: 1);

        Assert.Equal((3, 3), (selection.EligibleCount, selection.TrackIds.Count));
        Assert.Equal([1, 2, 3], selection.TrackIds.Order());
    }

    [Fact]
    public void LesMorceauxEnCooldown_NeSontJamaisTires()
    {
        var cooling = Pool(30).ToHashSet();
        for (var seed = 0; seed < 50; seed++)
            Assert.DoesNotContain(_selector.Select(Pool(60), cooling, 5, seed).TrackIds, cooling.Contains);
    }

    [Fact]
    public void PoolInsuffisant_AucunMorceau_LeComptePermetDeLeDire()
    {
        var selection = _selector.Select(Pool(10), new HashSet<int> { 1, 2, 3, 4, 5, 6 }, 5, seed: 1);

        Assert.False(selection.IsSufficient);
        Assert.Empty(selection.TrackIds);
        Assert.Equal((4, 5), (selection.EligibleCount, selection.Requested));
    }

    [Fact]
    public void ExactementLeNombreDemande_Suffit_LeTirageEstUneSimplePermutation()
    {
        var selection = _selector.Select(Pool(5), NoCooldown, 5, seed: 42);

        Assert.True(selection.IsSufficient);
        Assert.Equal([1, 2, 3, 4, 5], selection.TrackIds.Order());
    }

    [Fact]
    public void AucunCandidat_Insuffisant()
    {
        Assert.False(_selector.Select([], NoCooldown, 1, seed: 1).IsSufficient);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void UnDefiAuMoinsUnMorceau(int count) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => _selector.Select(Pool(5), NoCooldown, count, seed: 1));

    [Fact]
    public void LaGraineEstLeNumeroDuJour_CommeEnV1()
    {
        // 2026-10-05 : le numéro du jour sert de graine, pour que tout le monde joue le même défi, quelle que soit la façon de le générer.
        Assert.Equal(new DateOnly(2026, 10, 5).DayNumber, DailyChallenge.SeedOf(new DateOnly(2026, 10, 5)));
    }
}
