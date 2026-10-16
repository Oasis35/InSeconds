using InSeconds.Api.Modules.Gameplay.Domain;

namespace InSeconds.UnitTests.Gameplay;

public class FisherYatesShuffleTests
{
    private readonly FisherYatesShuffle _shuffle = new();

    [Fact]
    public void Shuffle_MemeGraine_MemeOrdre()
    {
        int[] items = [.. Enumerable.Range(0, 50)];

        Assert.Equal(_shuffle.Shuffle(items, 20_000), _shuffle.Shuffle(items, 20_000));
    }

    [Fact]
    public void Shuffle_GrainesDifferentes_OrdresDifferents()
    {
        int[] items = [.. Enumerable.Range(0, 50)];

        Assert.NotEqual(_shuffle.Shuffle(items, 20_000), _shuffle.Shuffle(items, 20_001));
    }

    [Fact]
    public void Shuffle_EstUnePermutation_SansPerteNiDoublon()
    {
        int[] items = [.. Enumerable.Range(0, 200)];

        var shuffled = _shuffle.Shuffle(items, 7);

        Assert.Equal(items.Length, shuffled.Count);
        Assert.Equal(items, shuffled.Order());
    }

    [Fact]
    public void Shuffle_NeModifiePasLaListeRecue()
    {
        int[] items = [1, 2, 3, 4, 5];

        _shuffle.Shuffle(items, 3);

        Assert.Equal([1, 2, 3, 4, 5], items);
    }

    [Fact]
    public void Shuffle_ListeVideOuDUnSeulElement()
    {
        Assert.Empty(_shuffle.Shuffle(Array.Empty<int>(), 1));
        Assert.Equal(["seul"], _shuffle.Shuffle(["seul"], 1));
    }

    [Fact]
    public void Shuffle_AccepteUneSequenceParesseuse()
    {
        var shuffled = _shuffle.Shuffle(Enumerable.Range(0, 10).Select(i => i * 2), 5);

        Assert.Equal(10, shuffled.Count);
    }

    [Fact]
    public void Shuffle_GardeLesElementsEnDouble()
    {
        var shuffled = _shuffle.Shuffle(new[] { "a", "a", "b" }, 11);

        Assert.Equal(["a", "a", "b"], shuffled.Order());
    }

    // Un défi est déterministe par date : tout changement de l'ordre pour une graine connue donnerait, pour une
    // même date, d'autres morceaux que ceux déjà annoncés. Cet ordre est celui que produit l'algorithme de la v1
    // (`Random(seed)`, indices de la fin vers le début) : il doit rester celui-là.
    [Fact]
    public void Shuffle_OrdreEpingle_PourUneGraineConnue()
    {
        var shuffled = _shuffle.Shuffle(Enumerable.Range(0, 10), 42);

        Assert.Equal([9, 0, 4, 2, 5, 7, 3, 8, 1, 6], shuffled);
    }

    [Fact]
    public void Shuffle_MemeOrdreQueLAlgorithmeDeLaV1()
    {
        // L'algorithme de la v1, recopié tel quel, sert de référence.
        var candidates = Enumerable.Range(0, 37).ToList();
        var rng = new Random(20_000);
        for (var i = candidates.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1);
            (candidates[i], candidates[j]) = (candidates[j], candidates[i]);
        }

        Assert.Equal(candidates, _shuffle.Shuffle(Enumerable.Range(0, 37), 20_000));
    }

    [Fact]
    public void Shuffle_ChaquePositionPeutRecevoirChaqueElement()
    {
        // Pas de biais de position (c'était la raison du Fisher-Yates) : sur beaucoup de graines, chaque position
        // reçoit tour à tour chacun des éléments.
        var orders = Enumerable.Range(0, 400).Select(seed => _shuffle.Shuffle(Enumerable.Range(0, 5), seed)).ToList();

        for (var position = 0; position < 5; position++)
            Assert.Equal(5, orders.Select(order => order[position]).ToHashSet().Count);
    }
}
