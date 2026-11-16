using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

public class RunChallengeTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 21, 8, 0, 0, TimeSpan.Zero);

    private static readonly int[] FirstRound = [1, 2, 3, 4, 5];

    [Fact]
    public void Cree_LaPremiereManche_EtGardeLesReglesFigees()
    {
        var challenge = RunChallenge.Create("K7Q2M9", 123, RunsOptions.DefaultRules(), FirstRound, Guid.NewGuid(), Now);

        Assert.Equal("K7Q2M9", challenge.Code);
        Assert.Equal(Enumerable.Range(1, 5), challenge.Tracks.Select(t => (int)t.Position));
        Assert.All(challenge.Tracks, t => Assert.Equal(1, t.Round));
        Assert.Equal(1, challenge.RoundsDrawn);
        Assert.True(challenge.HasRound(1));
        Assert.False(challenge.HasRound(2));
        Assert.Equal(3, challenge.Rules.Lives);
        Assert.Equal(Now, challenge.CreatedAt);
    }

    [Fact]
    public void AppendRound_AjouteLaMancheSuivante_AvecSonTheme()
    {
        var challenge = RunChallenge.Create("K7Q2M9", 1, RunsOptions.DefaultRules(), FirstRound, null, Now);

        challenge.AppendRound(2, [6, 7, 8, 9, 10], new RunRoundTheme(2, 12, "Années 80"));

        Assert.Equal(2, challenge.RoundsDrawn);
        Assert.Equal(10, challenge.Tracks.Count);
        Assert.Equal(6, challenge.TrackAt(6)!.TrackId);
        Assert.Equal(2, challenge.TrackAt(6)!.Round);
        Assert.Equal("Années 80", challenge.Rules.ThemeOf(2)!.Name);
        Assert.Null(challenge.Rules.ThemeOf(1));
    }

    [Fact]
    public void AppendRound_PasDansLOrdre_Refuse()
    {
        var challenge = RunChallenge.Create("K7Q2M9", 1, RunsOptions.DefaultRules(), FirstRound, null, Now);

        Assert.Throws<InvalidOperationException>(() => challenge.AppendRound(3, [6, 7, 8, 9, 10], null));
    }

    [Fact]
    public void AppendRound_UnMorceauDejaTire_Refuse()
    {
        var challenge = RunChallenge.Create("K7Q2M9", 1, RunsOptions.DefaultRules(), FirstRound, null, Now);

        Assert.Throws<ArgumentException>(() => challenge.AppendRound(2, [5, 7, 8, 9, 10], null));
    }

    [Fact]
    public void PasLeBonNombreDeMorceaux_Refuse() =>
        Assert.Throws<ArgumentException>(() => RunChallenge.Create("K7Q2M9", 1, RunsOptions.DefaultRules(), [1, 2, 3, 4], null, Now));

    [Fact]
    public void UnMorceauDeuxFois_Refuse() =>
        Assert.Throws<ArgumentException>(() => RunChallenge.Create("K7Q2M9", 1, RunsOptions.DefaultRules(), [1, 2, 3, 3, 5], null, Now));

    [Theory]
    [InlineData("k7q2m9")]
    [InlineData("K7Q2M")]
    [InlineData("K7Q2M0")]
    [InlineData("")]
    public void UnCodeInvalideOuEnMinuscules_Refuse(string code) =>
        Assert.Throws<ArgumentException>(() => RunChallenge.Create(code, 1, RunsOptions.DefaultRules(), FirstRound, null, Now));
}

public class RunChallengeCodeTests
{
    [Fact]
    public void LeCodeGenere_SixCaracteresDeLAlphabet()
    {
        for (var i = 0; i < 200; i++)
        {
            var code = RunChallengeCode.Generate();
            Assert.Equal(RunChallengeCode.Length, code.Length);
            Assert.All(code, c => Assert.Contains(c, RunChallengeCode.Alphabet));
            Assert.Equal(code, RunChallengeCode.Normalize(code));
        }
    }

    [Fact]
    public void LAlphabet_SansCaracteresAmbigus()
    {
        Assert.Equal(31, RunChallengeCode.Alphabet.Length);
        Assert.Equal(RunChallengeCode.Alphabet.Length, RunChallengeCode.Alphabet.Distinct().Count());
        Assert.DoesNotContain(RunChallengeCode.Alphabet, c => "01ILO".Contains(c, StringComparison.Ordinal));
    }

    [Fact]
    public void LesCodesTires_VarientDUnTirageALAutre() =>
        Assert.True(Enumerable.Range(0, 50).Select(_ => RunChallengeCode.Generate()).Distinct().Count() > 45);

    [Theory]
    [InlineData(" k7q2m9 ", "K7Q2M9")]
    [InlineData("K7Q2M9", "K7Q2M9")]
    [InlineData("K7Q2M", null)]
    [InlineData("K7Q2M91", null)]
    [InlineData("K7Q2MO", null)]
    [InlineData("K7Q2M-", null)]
    [InlineData(null, null)]
    public void Normalize_InsensibleALaCasse_RefuseLeReste(string? input, string? expected) =>
        Assert.Equal(expected, RunChallengeCode.Normalize(input));
}
