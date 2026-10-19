using InSeconds.Api.Modules.Catalogue.Domain;

namespace InSeconds.UnitTests.Catalogue;

/// <summary>Le domaine du morceau : états de l'extrait, désactivation, renommage (§ 5.4 du plan v2).</summary>
public class TrackTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 5, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset T1 = T0.AddHours(1);

    private static Track NewTrack(PreviewStatus preview = PreviewStatus.Available, int? rank = 400_000) =>
        Track.Create(new TrackMetadata(123, "Daft Punk", "One More Time", "abc123", 2000, rank, preview), T0);

    // ---------- Création ----------

    [Fact]
    public void Creation_PrendLesInformationsDeDeezer_EtDateLeControle()
    {
        var track = NewTrack();

        Assert.Equal(123, track.DeezerTrackId);
        Assert.Equal("Daft Punk", track.Artist);
        Assert.Equal("One More Time", track.Title);
        Assert.Equal("abc123", track.CoverHash);
        Assert.Equal((short)2000, track.ReleaseYear);
        Assert.Equal(400_000, track.DeezerRank);
        Assert.Equal(T0, track.RankUpdatedAt);
        Assert.Equal(PreviewStatus.Available, track.PreviewStatus);
        Assert.Equal(T0, track.PreviewCheckedAt);
        Assert.Equal(T0, track.CreatedAt);
        Assert.Null(track.UpdatedAt);
        Assert.False(track.IsDisabled);
        Assert.True(track.HasPreview);
    }

    [Fact]
    public void Creation_SansRang_PasDeDateDeRang()
    {
        var track = NewTrack(rank: null);

        Assert.Null(track.DeezerRank);
        Assert.Null(track.RankUpdatedAt);
    }

    [Fact]
    public void Creation_SansExtrait_EtatAbsent()
    {
        var track = NewTrack(PreviewStatus.Missing);

        Assert.Equal(PreviewStatus.Missing, track.PreviewStatus);
        Assert.False(track.HasPreview);
    }

    [Theory]
    [InlineData("", "Titre")]
    [InlineData("Artiste", "  ")]
    public void Creation_NomVide_Refusee(string artist, string title) =>
        Assert.Throws<ArgumentException>(() =>
            Track.Create(new TrackMetadata(1, artist, title, null, null, null, PreviewStatus.Available), T0));

    // ---------- Extrait : l'état ne change que sur une réponse de Deezer (piège 16) ----------

    [Fact]
    public void ControleDeLExtrait_Disponible_RepareUnFlagCorrompu()
    {
        var track = NewTrack(PreviewStatus.Missing);

        var changed = track.RecordPreviewCheck(PreviewCheck.Available, T1);

        Assert.True(changed);
        Assert.Equal(PreviewStatus.Available, track.PreviewStatus);
        Assert.Equal(T1, track.PreviewCheckedAt);
        Assert.Equal(T1, track.UpdatedAt);
    }

    [Fact]
    public void ControleDeLExtrait_Absent_MarqueLeMorceauSansExtrait()
    {
        var track = NewTrack();

        Assert.True(track.RecordPreviewCheck(PreviewCheck.Missing, T1));

        Assert.Equal(PreviewStatus.Missing, track.PreviewStatus);
    }

    [Theory]
    [InlineData(PreviewStatus.Available)]
    [InlineData(PreviewStatus.Missing)]
    public void ControleDeLExtrait_Indisponible_NeChangeRien_PasMemeLaDate(PreviewStatus before)
    {
        var track = NewTrack(before);

        var changed = track.RecordPreviewCheck(PreviewCheck.Unavailable, T1);

        Assert.False(changed);
        Assert.Equal(before, track.PreviewStatus);
        Assert.Equal(T0, track.PreviewCheckedAt);
        Assert.Null(track.UpdatedAt);
    }

    [Fact]
    public void ControleDeLExtrait_MemeEtat_SansChangement_MaisDateLeControle()
    {
        var track = NewTrack();

        var changed = track.RecordPreviewCheck(PreviewCheck.Available, T1);

        Assert.False(changed);
        Assert.Equal(T1, track.PreviewCheckedAt);
        Assert.Null(track.UpdatedAt);
    }

    [Fact]
    public void Controle_DepuisInconnu_EstUnChangement()
    {
        var track = Track.Create(new TrackMetadata(1, "A", "T", null, null, null, PreviewStatus.Unknown), T0);

        Assert.Null(track.PreviewCheckedAt);
        Assert.True(track.RecordPreviewCheck(PreviewCheck.Missing, T1));
    }

    // ---------- Rang ----------

    [Fact]
    public void Rang_EstNoteAvecSaDate()
    {
        var track = NewTrack(rank: null);

        track.RecordRank(123_456, T1);

        Assert.Equal(123_456, track.DeezerRank);
        Assert.Equal(T1, track.RankUpdatedAt);
    }

    // ---------- Désactivation ----------

    [Fact]
    public void Desactivation_RetireLeMorceauDuTirage_ReactivationLeRemet()
    {
        var track = NewTrack();

        track.Disable(T1);
        Assert.True(track.IsDisabled);
        Assert.Equal(T1, track.DisabledAt);
        Assert.Equal(T1, track.UpdatedAt);

        track.Enable(T1.AddHours(1));
        Assert.False(track.IsDisabled);
        Assert.Null(track.DisabledAt);
        Assert.Equal(T1.AddHours(1), track.UpdatedAt);
    }

    [Fact]
    public void Desactivation_Idempotente_GardeLaPremiereDate()
    {
        var track = NewTrack();
        track.Disable(T1);

        track.Disable(T1.AddDays(1));

        Assert.Equal(T1, track.DisabledAt);
        Assert.Equal(T1, track.UpdatedAt);
    }

    [Fact]
    public void Reactivation_DunMorceauActif_NeFaitRien()
    {
        var track = NewTrack();

        track.Enable(T1);

        Assert.Null(track.UpdatedAt);
    }

    // ---------- Renommage ----------

    [Fact]
    public void Renommage_CorrigeLesNoms_RogneLesEspaces_GardeLIdentifiantDeezer()
    {
        var track = NewTrack();

        track.Rename("  Daft Punk  ", " Around the World ", T1);

        Assert.Equal("Daft Punk", track.Artist);
        Assert.Equal("Around the World", track.Title);
        Assert.Equal(123, track.DeezerTrackId);
        Assert.Equal(T1, track.UpdatedAt);
    }

    [Theory]
    [InlineData("", "Titre")]
    [InlineData("Artiste", " ")]
    public void Renommage_NomVide_Refuse_EtRienNeChange(string artist, string title)
    {
        var track = NewTrack();

        Assert.Throws<ArgumentException>(() => track.Rename(artist, title, T1));

        Assert.Equal("Daft Punk", track.Artist);
        Assert.Null(track.UpdatedAt);
    }

    // ---------- Actualisation ----------

    [Fact]
    public void Actualisation_RemplaceToutCeQuiVientDeDeezer()
    {
        var track = NewTrack(PreviewStatus.Missing, rank: 1);

        track.ReplaceDeezerSource(new TrackMetadata(456, "Justice", "D.A.N.C.E.", "zzz", 2007, 250_000, PreviewStatus.Available), T1);

        Assert.Equal(456, track.DeezerTrackId);
        Assert.Equal("Justice", track.Artist);
        Assert.Equal("D.A.N.C.E.", track.Title);
        Assert.Equal("zzz", track.CoverHash);
        Assert.Equal((short)2007, track.ReleaseYear);
        Assert.Equal(250_000, track.DeezerRank);
        Assert.Equal(PreviewStatus.Available, track.PreviewStatus);
        Assert.Equal(T1, track.PreviewCheckedAt);
        Assert.Equal(T1, track.UpdatedAt);
        Assert.Equal(T0, track.CreatedAt);
    }
}
