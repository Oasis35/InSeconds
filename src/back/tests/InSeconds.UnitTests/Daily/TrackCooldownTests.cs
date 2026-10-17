using InSeconds.Api.Modules.Daily.Domain;

namespace InSeconds.UnitTests.Daily;

/// <summary>Le cooldown déduit de la taille du pool (#275) : ses jours, et la date à laquelle un morceau redevient tirable.</summary>
public class TrackCooldownTests
{
    [Theory]
    [InlineData(800, 75, 5, 120)] // la prod d'octobre 2026
    [InlineData(200, 75, 5, 30)]
    [InlineData(100, 50, 5, 10)]
    [InlineData(50, 75, 5, 7)] // le pool des E2E : 7,5 arrondi vers le bas
    [InlineData(100, 75, 3, 25)] // le nombre de morceaux par défi vient des réglages
    [InlineData(5, 75, 5, 0)] // tout petit pool : un morceau peut revenir dès le lendemain
    [InlineData(0, 75, 5, 0)]
    public void Jours_PartDuPoolDiviseeParLesMorceauxDUnDefi_ArrondieVersLeBas(int playable, int percent, int perChallenge, int days) =>
        Assert.Equal(days, TrackCooldown.Days(playable, percent, perChallenge));

    [Fact]
    public void Jours_UnGrandPool_NeDebordePas() =>
        Assert.Equal(386_547_056, TrackCooldown.Days(int.MaxValue, 90, 5));

    [Fact]
    public void Jours_ValeursImpossibles_Refusees()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => TrackCooldown.Days(-1, 75, 5));
        Assert.Throws<ArgumentOutOfRangeException>(() => TrackCooldown.Days(100, -1, 5));
        Assert.Throws<ArgumentOutOfRangeException>(() => TrackCooldown.Days(100, 75, 0));
    }

    [Fact]
    public void DateDeDeblocage_EstLePremierJourOuLeMorceauNEstPlusExclu()
    {
        var lastUsed = new DateOnly(2026, 10, 1);

        var unlock = TrackCooldown.UnlockDate(lastUsed, 30);

        Assert.Equal(new DateOnly(2026, 11, 1), unlock);
        // Exclu la veille (tiré à une date ≥ jour − cooldown), plus le jour même.
        Assert.True(lastUsed >= TrackCooldown.ExcludedFrom(unlock.AddDays(-1), 30));
        Assert.False(lastUsed >= TrackCooldown.ExcludedFrom(unlock, 30));
    }

    [Fact]
    public void SansCooldown_UnMorceauRevientLeLendemain() =>
        Assert.Equal(new DateOnly(2026, 10, 2), TrackCooldown.UnlockDate(new DateOnly(2026, 10, 1), 0));
}
