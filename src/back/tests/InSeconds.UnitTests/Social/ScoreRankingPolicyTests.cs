using InSeconds.Api.Modules.Social.Domain;

namespace InSeconds.UnitTests.Social;

public class ScoreRankingPolicyTests
{
    private static ScoreInput Member(string pseudo, int? score) => new(Guid.NewGuid(), pseudo, score);

    [Fact]
    public void Rank_LePlusHautDAbord_ExAequoMemeRang_SansScoreALaFin()
    {
        var rows = ScoreRankingPolicy.Rank([Member("Dan", null), Member("bob", 800), Member("Alice", 800), Member("Carol", 1200), Member("Eve", 300)]);

        Assert.Equal(["Carol", "Alice", "bob", "Eve", "Dan"], rows.Select(r => r.Pseudo));
        Assert.Equal([1, 2, 2, 4, null], rows.Select(r => r.Rank));
        Assert.Equal([1200, 800, 800, 300, null], rows.Select(r => r.Score));
    }

    [Fact]
    public void Rank_UnScoreNulEstUnScore() =>
        Assert.Equal([1, null], ScoreRankingPolicy.Rank([Member("Alice", 0), Member("Bob", null)]).Select(r => r.Rank));

    [Fact]
    public void Rank_Vide() => Assert.Empty(ScoreRankingPolicy.Rank([]));
}
