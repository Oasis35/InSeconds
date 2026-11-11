using InSeconds.Api.Modules.Catalogue.Domain;

namespace InSeconds.UnitTests.Catalogue;

/// <summary>Le domaine d'un candidat du sas : création, priorité, lecture chez Deezer, mise à l'écart, conditions d'ajout.</summary>
public class CandidateTests
{
    private static readonly DateTimeOffset T0 = new(2026, 11, 11, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset T1 = T0.AddMinutes(5);

    private static TrackMetadata Metadata(PreviewStatus preview = PreviewStatus.Available) =>
        new(321, "Prince", "Kiss", "abc", 1986, 839_000, preview, 77);

    private static Candidate ReadCandidate(PreviewStatus preview = PreviewStatus.Available)
    {
        var candidate = Candidate.Create(321, "A", T0);
        candidate.RecordRead(Metadata(preview), T1);
        return candidate;
    }

    [Fact]
    public void Creation_EstEnAttenteDeLecture_SansDonneesDeDeezer()
    {
        var candidate = Candidate.Create(321, null, T0);

        Assert.Equal(321, candidate.DeezerTrackId);
        Assert.Equal(CandidateStatus.Pending, candidate.Status);
        Assert.Null(candidate.Priority);
        Assert.Null(candidate.Artist);
        Assert.Equal(T0, candidate.CreatedAt);
        Assert.False(candidate.IsDismissed);
        Assert.False(candidate.CanBeAdded(T1));
    }

    [Fact]
    public void Creation_RefuseUnIdentifiantNul()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => Candidate.Create(0, null, T0));
    }

    [Theory]
    [InlineData("A", "A")]
    [InlineData("b", "B")]
    [InlineData(" c ", "C")]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Priorite_EstNormalisee(string? given, string? expected)
    {
        Assert.Equal(expected, Candidate.Create(1, given, T0).Priority);
    }

    [Theory]
    [InlineData("D")]
    [InlineData("AB")]
    [InlineData("1")]
    public void Priorite_AutreQueABC_EstRefusee(string priority)
    {
        Assert.False(Candidate.IsValidPriority(priority));
        Assert.Throws<ArgumentException>(() => Candidate.Create(1, priority, T0));
    }

    [Fact]
    public void Lecture_PrendLesInformationsDeDeezer()
    {
        var candidate = ReadCandidate();

        Assert.Equal(CandidateStatus.Ready, candidate.Status);
        Assert.Equal("Prince", candidate.Artist);
        Assert.Equal("Kiss", candidate.Title);
        Assert.Equal("abc", candidate.CoverHash);
        Assert.Equal((short)1986, candidate.ReleaseYear);
        Assert.Equal(839_000, candidate.Rank);
        Assert.Equal(PreviewStatus.Available, candidate.PreviewStatus);
        Assert.Equal(77, candidate.AlbumId);
        Assert.Equal(T1, candidate.ReadAt);
    }

    [Fact]
    public void Lecture_MorceauInconnuDeDeezer_EstIntrouvable_EtNePeutPasEtreAjoute()
    {
        var candidate = Candidate.Create(321, "A", T0);

        candidate.RecordNotFound(T1);

        Assert.Equal(CandidateStatus.NotFound, candidate.Status);
        Assert.Equal(T1, candidate.ReadAt);
        Assert.False(candidate.CanBeAdded(T1));
    }

    [Fact]
    public void ToMetadata_RedonneLeMorceauTelQueLePoolLeGarde()
    {
        var metadata = ReadCandidate().ToMetadata();

        Assert.Equal(Metadata(), metadata);
    }

    [Fact]
    public void PeutEtreAjoute_SeulementLuAvecExtraitNiEcarteNiEnCoursDAjout()
    {
        Assert.True(ReadCandidate().CanBeAdded(T1));
        Assert.False(ReadCandidate(PreviewStatus.Missing).CanBeAdded(T1));

        var dismissed = ReadCandidate();
        dismissed.SetDismissed(true, T1);
        Assert.False(dismissed.CanBeAdded(T1));

        var adding = ReadCandidate();
        adding.RequestAdd(T1);
        Assert.False(adding.CanBeAdded(T1));
        Assert.True(adding.IsAdding(T1));
    }

    [Fact]
    public void UneDemandeDAjoutSansSuite_EstPerdueApresLeDelai_EtLeCandidatPeutEtreRedemande()
    {
        var candidate = ReadCandidate();
        candidate.RequestAdd(T1);

        var later = T1 + Candidate.AddRequestTimeout;

        Assert.False(candidate.IsAdding(later));
        Assert.True(candidate.CanBeAdded(later));
    }

    [Fact]
    public void Ecarter_GardeLaPremiereDate_EtRemettreLaVide()
    {
        var candidate = ReadCandidate();

        candidate.SetDismissed(true, T0);
        candidate.SetDismissed(true, T1);
        Assert.Equal(T0, candidate.DismissedAt);
        Assert.True(candidate.IsDismissed);

        candidate.SetDismissed(false, T1);
        Assert.Null(candidate.DismissedAt);
        Assert.True(candidate.CanBeAdded(T1));
    }

    [Fact]
    public void Priorite_PeutEtrePoseeEtRetiree()
    {
        var candidate = Candidate.Create(1, null, T0);

        candidate.SetPriority("b");
        Assert.Equal("B", candidate.Priority);

        candidate.SetPriority(null);
        Assert.Null(candidate.Priority);
    }
}
