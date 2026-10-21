using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;

namespace InSeconds.UnitTests.Runs;

public class RunChallengeTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 21, 8, 0, 0, TimeSpan.Zero);

    private static List<PlannedTrack> Tracks(int count = 20) =>
        Enumerable.Range(1, count).Select(id => new PlannedTrack(id, (id - 1) / 5 + 1, 1m)).ToList();

    [Fact]
    public void Cree_LesMorceauxAuxPositions_EtGardeLesReglesFigees()
    {
        var challenge = RunChallenge.Create("K7Q2M9", 123, RunsOptions.DefaultRules(), Tracks(), Guid.NewGuid(), Now);

        Assert.Equal("K7Q2M9", challenge.Code);
        Assert.Equal(20, challenge.Tracks.Count);
        Assert.Equal(Enumerable.Range(1, 20), challenge.Tracks.Select(t => (int)t.Position));
        Assert.Equal([1, 2, 3, 4], challenge.Tracks.Select(t => (int)t.Round).Distinct());
        Assert.Equal(RunsOptions.DefaultRules().Rounds, challenge.Rules.Rounds);
        Assert.Equal(Now, challenge.CreatedAt);
    }

    [Fact]
    public void PasLeBonNombreDeMorceaux_Refuse() =>
        Assert.Throws<ArgumentException>(() => RunChallenge.Create("K7Q2M9", 1, RunsOptions.DefaultRules(), Tracks(19), null, Now));

    [Fact]
    public void UnMorceauDeuxFois_Refuse()
    {
        var tracks = Tracks();
        tracks[3] = tracks[2];

        Assert.Throws<ArgumentException>(() => RunChallenge.Create("K7Q2M9", 1, RunsOptions.DefaultRules(), tracks, null, Now));
    }

    [Theory]
    [InlineData("k7q2m9")]
    [InlineData("K7Q2M")]
    [InlineData("K7Q2M0")]
    [InlineData("")]
    public void UnCodeInvalideOuEnMinuscules_Refuse(string code) =>
        Assert.Throws<ArgumentException>(() => RunChallenge.Create(code, 1, RunsOptions.DefaultRules(), Tracks(), null, Now));
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
