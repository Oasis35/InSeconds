using InSeconds.Api.Modules.Players.Domain;

namespace InSeconds.UnitTests.Players;

public class ReservedNamePolicyTests
{
    [Fact]
    public void Une_liste_vide_dans_les_reglages_rend_la_liste_de_depart()
    {
        var empty = new InSeconds.Api.Modules.Players.Application.PlayersOptions { ReservedContains = [], ReservedWords = null };

        Assert.Same(ReservedNameDefaults.Contains, empty.EffectiveReservedContains);
        Assert.Same(ReservedNameDefaults.Words, empty.EffectiveReservedWords);
        Assert.Same(ReservedNameDefaults.Exact, empty.EffectiveReservedExact);
    }

    private static readonly ReservedNamePolicy Defaults =
        new(ReservedNameDefaults.Contains, ReservedNameDefaults.Words, ReservedNameDefaults.Exact);

    [Theory]
    [InlineData("InSeconds")]
    [InlineData("inseconds")]
    [InlineData("INSECONDS")]
    [InlineData("In Seconds")]
    [InlineData("in_seconds")]
    [InlineData("InSeconds.cc")]
    [InlineData("inseconds.com")]
    [InlineData("1nSeconds")]
    [InlineData("InSec0nds")]
    [InlineData("iinnseconds")]
    [InlineData("Team InSeconds")]
    [InlineData("TeamInSeconds")]
    [InlineData("InSeconds Officiel")]
    [InlineData("Admin")]
    [InlineData("admin")]
    [InlineData("ADMIN")]
    [InlineData("4dm1n")]
    [InlineData("adminnn")]
    [InlineData("Admin Club")]
    [InlineData("SuperAdmin")]
    [InlineData("Administrateur")]
    [InlineData("Modérateur")]
    [InlineData("moderateur")]
    [InlineData("Support")]
    [InlineData("Officiel")]
    [InlineData("Équipe")]
    [InlineData("Team")]
    [InlineData("Team2")]
    [InlineData("Deezer")]
    [InlineData("Les Fans de Spotify")]
    [InlineData("Shazam Team")]
    [InlineData("аdmin")] // « а » cyrillique
    public void Un_nom_qui_preterait_a_confusion_est_reserve(string name) => Assert.True(Defaults.IsReserved(name));

    [Theory]
    [InlineData("Les copains")]
    [InlineData("Team Dupont")]
    [InlineData("Badminton")]
    [InlineData("Club de badminton")]
    [InlineData("Supporters de Lens")]
    [InlineData("Les Seconds")]
    [InlineData("Apple Pie")]
    [InlineData("Équipe Rocket")]
    [InlineData("Quiz du lundi")]
    [InlineData("Marie")]
    [InlineData("Claude Dupont")]
    [InlineData("Marie Claude")]
    public void Un_nom_ordinaire_est_accepte(string name) => Assert.False(Defaults.IsReserved(name));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("...")]
    public void Un_nom_vide_nest_pas_reserve(string? name) => Assert.False(Defaults.IsReserved(name));

    [Fact]
    public void Un_pseudo_reserve_est_refuse_seul_et_pas_dans_un_nom_plus_long()
    {
        Assert.True(Defaults.IsReserved("Claude"));
        Assert.True(Defaults.IsReserved("Genius2"));
    }

    [Fact]
    public void Les_termes_du_reglage_remplacent_ceux_de_depart()
    {
        var policy = new ReservedNamePolicy(["bobby"], [], []);

        Assert.True(policy.IsReserved("Bobby Lapointe"));
        Assert.False(policy.IsReserved("InSeconds"));
    }

    [Fact]
    public void Un_terme_du_reglage_est_normalise_comme_la_saisie()
    {
        var policy = new ReservedNamePolicy([], ["Équipe  Spéciale"], []);

        Assert.True(policy.IsReserved("equipespeciale"));
    }
}
