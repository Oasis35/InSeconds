using InSeconds.Api.Modules.Social.Contracts;
using InSeconds.Api.Modules.Social.Domain;

namespace InSeconds.UnitTests.Social;

public class GroupTests
{
    private static readonly DateTimeOffset T0 = new(2026, 11, 11, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid Alice = Guid.Parse("00000000-0000-0000-0000-00000000000a");
    private static readonly Guid Bob = Guid.Parse("00000000-0000-0000-0000-00000000000b");
    private static readonly Guid Carol = Guid.Parse("00000000-0000-0000-0000-00000000000c");

    private static Group NewGroup() => Group.Create(" Les copains ", "ABCD2345", Alice, T0);

    [Fact]
    public void Create_LeCreateurEstMembreEtProprietaire_NomRogne()
    {
        var group = NewGroup();

        Assert.Equal("Les copains", group.Name);
        Assert.True(group.IsOwner(Alice));
        Assert.True(group.IsMember(Alice));
        Assert.Single(group.Members);
    }

    [Fact]
    public void Create_CodeInvalide_Refuse() =>
        Assert.Throws<ArgumentException>(() => Group.Create("Les copains", "abc", Alice, T0));

    [Fact]
    public void Join_DejaMembre_Refuse()
    {
        var group = NewGroup();
        Assert.Throws<InvalidOperationException>(() => group.Join(Alice, T0));
    }

    [Fact]
    public void IsFull_ALaLimite()
    {
        var group = NewGroup();
        group.Join(Bob, T0);

        Assert.True(group.IsFull(2));
        Assert.False(group.IsFull(3));
    }

    [Fact]
    public void Leave_UnMembre_LeGroupeResteAuMemeCreateur()
    {
        var group = NewGroup();
        group.Join(Bob, T0);

        Assert.Equal(GroupDeparture.Left, group.Leave(Bob));
        Assert.True(group.IsOwner(Alice));
    }

    [Fact]
    public void Leave_LeCreateur_LePlusAncienMembreLeDevient()
    {
        var group = NewGroup();
        group.Join(Carol, T0.AddMinutes(2));
        group.Join(Bob, T0.AddMinutes(1));

        Assert.Equal(GroupDeparture.OwnerChanged, group.Leave(Alice));
        Assert.True(group.IsOwner(Bob));
    }

    [Fact]
    public void Leave_LeDernier_LeGroupeEstVide()
    {
        var group = NewGroup();
        Assert.Equal(GroupDeparture.Emptied, group.Leave(Alice));
    }

    [Fact]
    public void Leave_PasMembre_Refuse() =>
        Assert.Throws<InvalidOperationException>(() => NewGroup().Leave(Bob));

    [Fact]
    public void RotateInviteCode_ChangeLeCode_RefuseUnCodeInvalide()
    {
        var group = NewGroup();
        group.RotateInviteCode("ZZZZ9999");

        Assert.Equal("ZZZZ9999", group.InviteCode);
        Assert.Throws<ArgumentException>(() => group.RotateInviteCode("nope"));
    }
}

public class GroupInviteCodeTests
{
    [Fact]
    public void Generate_HuitCaracteresDeLAlphabet()
    {
        for (var i = 0; i < 50; i++)
        {
            var code = GroupInviteCode.Generate();
            Assert.Equal(GroupInviteCode.Length, code.Length);
            Assert.Equal(code, GroupInviteCode.Normalize(code));
        }
    }

    [Theory]
    [InlineData("abcd2345", "ABCD2345")]
    [InlineData("  ABCD2345 ", "ABCD2345")]
    [InlineData("ABCD234", null)]
    [InlineData("ABCD23456", null)]
    [InlineData("ABCDI345", null)]
    [InlineData("ABCDO345", null)]
    [InlineData("ABCD 345", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Normalize(string? input, string? expected) => Assert.Equal(expected, GroupInviteCode.Normalize(input));
}

public class GroupNameTests
{
    [Theory]
    [InlineData("Les copains", true)]
    [InlineData("abc", true)]
    [InlineData("ab", false)]
    [InlineData("Les <copains>", false)]
    [InlineData("Un nom beaucoup trop long pour un groupe", false)]
    [InlineData("   ", false)]
    [InlineData(null, false)]
    public void IsValid(string? name, bool expected) => Assert.Equal(expected, GroupName.IsValid(name, 24));

    [Theory]
    [InlineData(1)]
    [InlineData(12)]
    [InlineData(2147483647)]
    public void Replacement_EstUnNomValide_AvecLeReglageParDefaut(int id) =>
        Assert.True(GroupName.IsValid(GroupName.Replacement(id), 24));

    [Fact]
    public void Rename_RogneLeNom_EtGardeLeCodeEtLesMembres()
    {
        var group = Group.Create("Les copains", "ABCD2345", Guid.NewGuid(), DateTimeOffset.UnixEpoch);

        group.Rename("  Les amis ");

        Assert.Equal("Les amis", group.Name);
        Assert.Equal("ABCD2345", group.InviteCode);
        Assert.Single(group.Members);
    }
}

public class GroupRankingPolicyTests
{
    private static RankingInput Member(string pseudo, params MemberPerformance[] performances) =>
        new(Guid.NewGuid(), pseudo, performances);

    [Fact]
    public void LesMeilleuresPerformancesPremieres_LesSansPartieALaFin()
    {
        var rows = GroupRankingPolicy.Rank([
            Member("Zoe"),
            Member("Bob", new MemberPerformance(0.5, 3, 900)),
            Member("Alice", new MemberPerformance(0.75, 2, 1200)),
        ]);

        Assert.Equal(["Alice", "Bob", "Zoe"], rows.Select(r => r.Pseudo));
        Assert.Equal([1, 2, null], rows.Select(r => r.Rank));
        Assert.Null(rows[2].Performance);
        Assert.Equal(0, rows[2].GamesPlayed);
    }

    [Fact]
    public void Egalite_MemeRang_PuisLeRangSaute()
    {
        var rows = GroupRankingPolicy.Rank([
            Member("Bob", new MemberPerformance(0.5, 3)),
            Member("Alice", new MemberPerformance(0.5, 3)),
            Member("Carol", new MemberPerformance(0.25, 1)),
        ]);

        Assert.Equal(["Alice", "Bob", "Carol"], rows.Select(r => r.Pseudo));
        Assert.Equal([1, 1, 3], rows.Select(r => r.Rank));
    }

    [Fact]
    public void MemePerformance_LeJoueurQuiAPlusJoueDevant()
    {
        var rows = GroupRankingPolicy.Rank([
            Member("Alice", new MemberPerformance(0.5, 1)),
            Member("Bob", new MemberPerformance(0.5, 4)),
        ]);

        Assert.Equal(["Bob", "Alice"], rows.Select(r => r.Pseudo));
        Assert.Equal([1, 2], rows.Select(r => r.Rank));
    }

    [Fact]
    public void PlusieursSources_MoyenneBornee_PartiesAdditionnees_MeilleurScore()
    {
        var rows = GroupRankingPolicy.Rank([
            Member("Alice", new MemberPerformance(1.5, 2, 800), new MemberPerformance(0.5, 3, 1500)),
        ]);

        var row = Assert.Single(rows);
        Assert.Equal(0.75, row.Performance);
        Assert.Equal(5, row.GamesPlayed);
        Assert.Equal(1500, row.BestScore);
    }

    [Fact]
    public void PointsEtDisque_CeuxDeLaSource_UnMembreSansPartieNEnAPas()
    {
        var rows = GroupRankingPolicy.Rank([
            Member("Alice", new MemberPerformance(0.5, 4, 1900, Points: 1700, Badge: "runs.discs.gold")),
            Member("Bob"),
        ]);

        Assert.Equal((1700, "runs.discs.gold"), (rows[0].Points, rows[0].Badge));
        Assert.Equal((null, null), (rows[1].Points, rows[1].Badge));
    }

    [Fact]
    public void Vide_RienARendre() => Assert.Empty(GroupRankingPolicy.Rank([]));
}
