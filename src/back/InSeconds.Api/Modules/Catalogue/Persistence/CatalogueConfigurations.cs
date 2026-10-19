using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

// Table du schéma catalogue (§ 4.3 du plan v2). Pas de navigation EF vers les autres modules : un défi
// référencera un morceau par son identifiant (la clé étrangère est déclarée du côté de Daily).

internal sealed class TrackConfiguration : IEntityTypeConfiguration<Track>
{
    /// <summary>Index unique de l'identifiant Deezer, reconnu dans l'erreur d'unicité par <see cref="TrackConflictExceptionHandler"/>.</summary>
    public const string DeezerIdIndex = "ix_tracks_deezer_track_id";

    public void Configure(EntityTypeBuilder<Track> builder)
    {
        builder.ToTable("tracks", DbSchemas.Catalogue, table => table.HasCheckConstraint(
            "ck_tracks_preview_status", "preview_status IN (0, 1, 2)"));
        builder.HasKey(t => t.Id);
        // Identifiant tiré d'une séquence dès l'ajout (et non par la base à l'insertion) : l'endpoint le met
        // dans sa réponse, construite avant que Wolverine n'enregistre la transaction.
        builder.Property(t => t.Id).UseHiLo("tracks_hilo", DbSchemas.Catalogue);
        builder.Property(t => t.DeezerTrackId).IsRequired();
        builder.HasIndex(t => t.DeezerTrackId).IsUnique().HasDatabaseName(DeezerIdIndex);
        builder.Property(t => t.Artist).IsRequired();
        builder.Property(t => t.Title).IsRequired();
        // preview_status : 0 inconnu, 1 disponible, 2 absent.
        builder.Property(t => t.PreviewStatus).HasConversion<short>();
    }
}
