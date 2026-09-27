using FluentAssertions;
using InSeconds.Api.Common.Stats;
using Xunit;

namespace InSeconds.Api.UnitTests.Common.Stats;

public sealed class MedianCalculatorTests
{
    [Fact]
    public void Compute_ListeVide_RetourneNull()
    {
        MedianCalculator.Compute([]).Should().BeNull();
    }

    [Fact]
    public void Compute_UnSeulElement_RetourneCetElement()
    {
        MedianCalculator.Compute([42]).Should().Be(42);
    }

    [Fact]
    public void Compute_EffectifImpair_RetourneLaValeurCentrale()
    {
        MedianCalculator.Compute([100, 300, 200]).Should().Be(200);
    }

    [Fact]
    public void Compute_EffectifPair_RetourneLaMoyenneDesDeuxValeursCentrales()
    {
        MedianCalculator.Compute([100, 200, 300, 400]).Should().Be(250);
    }

    [Fact]
    public void Compute_EffectifPair_MoyenneNonEntiere_RetourneUneDemie()
    {
        MedianCalculator.Compute([100, 201]).Should().Be(150.5);
    }

    [Fact]
    public void Compute_NePresupposeAucunOrdreEnEntree()
    {
        MedianCalculator.Compute([500, 100, 300, 200, 400]).Should().Be(300);
    }

    [Fact]
    public void Compute_ValeursNegatives_FonctionneNormalement()
    {
        MedianCalculator.Compute([-100, -50, 0]).Should().Be(-50);
    }

    [Fact]
    public void Compute_ValeursIdentiques_RetourneCetteValeur()
    {
        MedianCalculator.Compute([700, 700, 700]).Should().Be(700);
    }
}
