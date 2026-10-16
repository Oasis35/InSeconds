using InSeconds.Api.Modules.Catalogue.Application;
using InSeconds.Api.Modules.Catalogue.Domain;
using InSeconds.Api.Modules.Catalogue.Persistence;
using InSeconds.Deezer;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.UnitTests.Catalogue;

public class CatalogueSupportTests
{
    // ---------- Pochette ----------

    [Fact]
    public void CoverUrl_ReconstruiteDepuisLeHash_ParLeGabaritDesReglages()
    {
        var options = new CatalogueOptions();

        Assert.Equal(
            "https://cdn-images.dzcdn.net/images/cover/abc123/250x250-000000-80-0-0.jpg",
            options.CoverUrl("abc123"));

        options.CoverUrlTemplate = "https://cdn.example/{hash}/big.jpg";
        Assert.Equal("https://cdn.example/abc123/big.jpg", options.CoverUrl("abc123"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void CoverUrl_SansHash_Vide(string? hash) => Assert.Null(new CatalogueOptions().CoverUrl(hash));

    // ---------- Correspondance Deezer -> pool ----------

    [Fact]
    public void Metadonnees_ExtraitVide_EtatAbsent_ExtraitPresent_EtatDisponible()
    {
        var withPreview = TrackMapping.ToMetadata(new DeezerTrack(1, "A", "T", "https://p.mp3", "h", 2001, 5));
        var without = TrackMapping.ToMetadata(new DeezerTrack(2, "A", "T", "", null, null, null));
        var missing = TrackMapping.ToMetadata(new DeezerTrack(3, "A", "T", null, null, null, null));

        Assert.Equal(PreviewStatus.Available, withPreview.Preview);
        Assert.Equal((short)2001, withPreview.ReleaseYear);
        Assert.Equal(PreviewStatus.Missing, without.Preview);
        Assert.Equal(PreviewStatus.Missing, missing.Preview);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(40_000)]
    public void Metadonnees_AnneeAbsurde_Ignoree_PlutotQueDeFairePlanterLAjout(int year) =>
        Assert.Null(TrackMapping.ToMetadata(new DeezerTrack(1, "A", "T", "p", null, year, null)).ReleaseYear);

    [Theory]
    [InlineData(PreviewStatus.Unknown, "unknown")]
    [InlineData(PreviewStatus.Available, "available")]
    [InlineData(PreviewStatus.Missing, "missing")]
    public void EtatDeLExtrait_NomsStablesDeLApi(PreviewStatus status, string name) =>
        Assert.Equal(name, TrackMapping.Name(status));

    // ---------- Doublon simultané ----------

    [Fact]
    public void UniciteDeLIdentifiantDeezer_DoublonDeezer() =>
        Assert.Equal(CatalogueErrorCodes.DuplicateDeezerId, Code(UniqueViolation(TrackConfiguration.DeezerIdIndex)));

    [Fact]
    public void AutreIndexUnique_PasPourCeGestionnaire() =>
        Assert.Null(TrackConflictExceptionHandler.ProblemFor(UniqueViolation("ix_accounts_pseudo")));

    [Fact]
    public void AutreErreur_PasPourCeGestionnaire() =>
        Assert.Null(TrackConflictExceptionHandler.ProblemFor(new DbUpdateException("x", new InvalidOperationException())));

    [Fact]
    public void CodesPublies_NeChangentJamais()
    {
        Assert.Equal("catalogue.track_in_use", CatalogueErrorCodes.TrackInUse);
        Assert.Equal("catalogue.track_in_today_challenge", CatalogueErrorCodes.TrackInTodayChallenge);
        Assert.Equal("catalogue.duplicate_deezer_id", CatalogueErrorCodes.DuplicateDeezerId);
        Assert.Equal("catalogue.not_found_on_deezer", CatalogueErrorCodes.NotFoundOnDeezer);
        Assert.Equal("catalogue.deezer_unavailable", CatalogueErrorCodes.DeezerUnavailable);
    }

    private static string? Code(Exception exception) =>
        TrackConflictExceptionHandler.ProblemFor(exception)?.Extensions["code"]?.ToString();

    private static DbUpdateException UniqueViolation(string constraint) =>
        new("x", new PostgresException("duplicate key", "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation, constraintName: constraint));
}
