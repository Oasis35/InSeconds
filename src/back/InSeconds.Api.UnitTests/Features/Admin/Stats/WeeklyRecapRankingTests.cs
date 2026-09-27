using Xunit;
using InSeconds.Api.Features.Admin.Stats.GetWeeklyRecap;
using Row = InSeconds.Api.Features.Admin.Stats.GetWeeklyRecap.GetWeeklyRecapEndpoint.WeeklyTrackRow;

namespace InSeconds.Api.UnitTests.Features.Admin.Stats;

public class WeeklyRecapRankingTests
{
    private static Row R(string title, int answers, int correct) => new("Artiste", title, null, answers, correct);

    [Fact]
    public void Rank_ChoisitLeMeilleurEtLePireTaux()
    {
        var (found, missed) = GetWeeklyRecapEndpoint.Rank(
            [R("Moyen", 10, 5), R("Facile", 4, 4), R("Dur", 5, 0)], minAnswers: 3);

        Assert.Equal("Facile", found!.Title);
        Assert.Equal(100, found.RatePercent);
        Assert.Equal("Dur", missed!.Title);
        Assert.Equal(0, missed.RatePercent);
    }

    [Fact]
    public void Rank_ExclutLesMorceauxSousLeSeuil()
    {
        var (found, missed) = GetWeeklyRecapEndpoint.Rank(
            [R("Parfait mais rare", 2, 2), R("Nul mais rare", 2, 0), R("A", 3, 2), R("B", 3, 1)], minAnswers: 3);

        Assert.Equal("A", found!.Title);
        Assert.Equal("B", missed!.Title);
    }

    [Fact]
    public void Rank_AucunMorceauEligible_RenvoieNull()
    {
        var (found, missed) = GetWeeklyRecapEndpoint.Rank([R("A", 2, 2)], minAnswers: 3);

        Assert.Null(found);
        Assert.Null(missed);
    }

    [Fact]
    public void Rank_UnSeulMorceauEligible_PasDePlusRate()
    {
        var (found, missed) = GetWeeklyRecapEndpoint.Rank([R("Seul", 5, 1), R("Rare", 1, 0)], minAnswers: 3);

        Assert.Equal("Seul", found!.Title);
        Assert.Null(missed);
    }

    [Fact]
    public void Rank_TauxEgaux_LePlusReponduLEmporte()
    {
        var (found, missed) = GetWeeklyRecapEndpoint.Rank(
            [R("Petit", 4, 2), R("Gros", 10, 5), R("Moyen", 6, 3)], minAnswers: 3);

        Assert.Equal("Gros", found!.Title);
        Assert.Equal("Moyen", missed!.Title);
    }

    [Fact]
    public void Rank_MorceauxIdentiques_NeRenvoiePasDeuxFoisLeMeme()
    {
        var a = R("Pareil", 5, 5);
        var b = R("Pareil", 5, 5);

        var (found, missed) = GetWeeklyRecapEndpoint.Rank([a, b], minAnswers: 3);

        Assert.Same(a, found);
        Assert.Same(b, missed);
    }
}
