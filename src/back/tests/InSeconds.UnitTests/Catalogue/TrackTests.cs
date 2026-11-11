using InSeconds.Api.Modules.Catalogue.Domain;

namespace InSeconds.UnitTests.Catalogue;

/// <summary>Le domaine du morceau : états de l'extrait, désactivation, renommage.</summary>
public class TrackTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 5, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset T1 = T0.AddHours(1);

    private static Track NewTrack(PreviewStatus preview = PreviewStatus.Available, int? rank = 400_000) =>
        Track.Create(new TrackMetadata(123, "Daft Punk", "One More Time", "abc123", 2000, rank, preview, null), T0);

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

    [Fact]
    public void TitresAlternatifs_Nettoyes_SansDoublonNiCopieDuTitre()
    {
        var track = NewTrack();

        track.SetAltTitles([" 22h31 - Around ", "22H31 - AROUND", "", track.Title.ToUpperInvariant(), "Autre"], T1);

        Assert.Equal(["22h31 - Around", "Autre"], track.AltTitles);
        Assert.Equal(T1, track.UpdatedAt);
    }

    [Fact]
    public void TitresAlternatifs_TropNombreux_Refuses_EtRienNeChange()
    {
        var track = NewTrack();
        track.SetAltTitles(["a"], T1);

        Assert.Throws<ArgumentException>(() => track.SetAltTitles(["1", "2", "3", "4", "5", "6"], T1));

        Assert.Equal(["a"], track.AltTitles);
    }

    [Theory]
    [InlineData("", "Titre")]
    [InlineData("Artiste", "  ")]
    public void Creation_NomVide_Refusee(string artist, string title) =>
        Assert.Throws<ArgumentException>(() =>
            Track.Create(new TrackMetadata(1, artist, title, null, null, null, PreviewStatus.Available, null), T0));

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
        var track = Track.Create(new TrackMetadata(1, "A", "T", null, null, null, PreviewStatus.Unknown, null), T0);

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

    // ---------- Album et genres ----------

    private static Track OnAlbum(long? albumId) =>
        Track.Create(new TrackMetadata(1, "A", "T", null, null, null, PreviewStatus.Available, albumId), T0);

    [Fact]
    public void Creation_GardeLAlbum_SansGenreTantQuIlsNeSontPasLus()
    {
        var track = OnAlbum(302127);

        Assert.Equal(302127, track.AlbumId);
        Assert.Null(track.GenresCheckedAt);
        Assert.Empty(track.Genres);
    }

    [Fact]
    public void LesGenresLus_SontPoses_AvecLaDate_SansDoublon()
    {
        var track = OnAlbum(1);
        var pop = new Genre(132, "Pop");

        track.RecordGenres([pop, new Genre(132, "Pop"), new Genre(113, "Dance")], T1);

        Assert.Equal([132L, 113L], track.Genres.Select(g => g.Id));
        Assert.Equal(T1, track.GenresCheckedAt);
    }

    [Fact]
    public void UnAlbumSansGenre_EstQuandMemeNoteCommeLu()
    {
        var track = OnAlbum(1);

        track.RecordGenres([], T1);

        Assert.Empty(track.Genres);
        Assert.Equal(T1, track.GenresCheckedAt);
    }

    [Fact]
    public void GenreSaisiALaMain_RemplaceLesGenres_EtSeRelitAuBoutDUnMois()
    {
        var track = OnAlbum(1);
        var rock = new Genre(-1, "Rock");

        track.SetManualGenre(rock, T1);

        Assert.Equal([-1L], track.Genres.Select(g => g.Id));
        Assert.True(track.GenresManual);
        Assert.False(track.GenresNeedReading(T1.AddDays(29), TimeSpan.FromDays(30)));
        Assert.True(track.GenresNeedReading(T1.AddDays(30), TimeSpan.FromDays(30)));
    }

    [Fact]
    public void GenreSaisiALaMain_DeezerQuiNEnDonneToujoursAucun_LeLaisse_UnGenreDeDeezerLEcrase()
    {
        var track = OnAlbum(1);
        track.SetManualGenre(new Genre(-1, "Rock"), T1);

        track.RecordGenres([], T1.AddDays(30));
        Assert.Equal([-1L], track.Genres.Select(g => g.Id));
        Assert.Equal(T1.AddDays(30), track.GenresCheckedAt);

        track.RecordGenres([new Genre(132, "Pop")], T1.AddDays(60));
        Assert.Equal([132L], track.Genres.Select(g => g.Id));
        Assert.False(track.GenresManual);
    }

    [Fact]
    public void ViderLeGenreSaisi_LeRetire_MaisNeTouchePasAuxGenresDeDeezer()
    {
        var manual = OnAlbum(1);
        manual.SetManualGenre(new Genre(-1, "Rock"), T1);
        manual.SetManualGenre(null, T1);
        Assert.Empty(manual.Genres);
        Assert.Null(manual.GenresCheckedAt);

        var fromDeezer = OnAlbum(1);
        fromDeezer.RecordGenres([new Genre(132, "Pop")], T1);
        fromDeezer.SetManualGenre(null, T1);
        Assert.Equal([132L], fromDeezer.Genres.Select(g => g.Id));
    }

    [Fact]
    public void RelireLeMemeAlbum_GardeLesGenres()
    {
        var track = OnAlbum(1);
        track.RecordGenres([new Genre(132, "Pop")], T1);

        track.RecordAlbum(1);
        track.RecordAlbum(null);

        Assert.Single(track.Genres);
        Assert.Equal(T1, track.GenresCheckedAt);
    }

    [Fact]
    public void UnAutreAlbum_EffaceLesGenresDeLAncien_EtLesRemetALire()
    {
        var track = OnAlbum(1);
        track.RecordGenres([new Genre(132, "Pop")], T1);

        track.RecordAlbum(2);

        Assert.Equal(2, track.AlbumId);
        Assert.Empty(track.Genres);
        Assert.Null(track.GenresCheckedAt);
    }

    [Fact]
    public void ActualiserUnMorceau_QuiChangeDAlbum_EffaceLesGenres()
    {
        var track = OnAlbum(1);
        track.RecordGenres([new Genre(132, "Pop")], T1);

        track.ReplaceDeezerSource(new TrackMetadata(456, "Justice", "D.A.N.C.E.", null, null, null, PreviewStatus.Available, AlbumId: 9), T1);

        Assert.Equal(9, track.AlbumId);
        Assert.Empty(track.Genres);
        Assert.Null(track.GenresCheckedAt);
    }

    [Fact]
    public void ActualiserUnMorceau_DuMemeAlbum_GardeLesGenres()
    {
        var track = OnAlbum(1);
        track.RecordGenres([new Genre(132, "Pop")], T1);

        track.ReplaceDeezerSource(new TrackMetadata(456, "Justice", "D.A.N.C.E.", null, null, null, PreviewStatus.Available, AlbumId: 1), T1);

        Assert.Single(track.Genres);
        Assert.Equal(T1, track.GenresCheckedAt);
    }

    // ---------- Actualisation ----------

    [Fact]
    public void Actualisation_RemplaceToutCeQuiVientDeDeezer()
    {
        var track = NewTrack(PreviewStatus.Missing, rank: 1);

        track.ReplaceDeezerSource(new TrackMetadata(456, "Justice", "D.A.N.C.E.", "zzz", 2007, 250_000, PreviewStatus.Available, null), T1);

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

    // ---------- Thèmes ----------

    private static Theme ThemeWithId(int id, string name)
    {
        var theme = new Theme(name, T0);
        typeof(Theme).GetProperty(nameof(Theme.Id))!.SetValue(theme, id);
        return theme;
    }

    [Fact]
    public void AddThemes_AjouteSansRetirer_EtNeCompteQueLesNouveaux()
    {
        var films = ThemeWithId(1, "Films");
        var rap = ThemeWithId(2, "Rap");
        var track = NewTrack();
        track.SetThemes([rap], T0);

        var added = track.AddThemes([films, rap, films], T1);

        Assert.Equal(1, added);
        Assert.Equal([1, 2], track.Themes.Select(t => t.Id).Order());
        Assert.Equal(T1, track.UpdatedAt);
    }

    [Fact]
    public void AddThemes_RienDeNouveau_NeChangeNiLesThemesNiLaDate()
    {
        var films = ThemeWithId(1, "Films");
        var track = NewTrack();
        track.SetThemes([films], T0);

        var added = track.AddThemes([films], T1);

        Assert.Equal(0, added);
        Assert.Equal(T0, track.UpdatedAt);
    }
}
