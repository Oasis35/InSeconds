using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Modules.Catalogue.Persistence;

// Tables du schéma catalogue. Pas de navigation EF vers les autres modules : un défi
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
        // album_id : l'album chez Deezer (les genres se lisent sur lui) ; genres_checked_at : vide tant que ses genres n'ont pas été lus.
        builder.Property(t => t.AlbumId);
        builder.Property(t => t.GenresCheckedAt);
        // Les genres du morceau (ceux de son album) : table de jonction track_genres, supprimée avec le morceau ou le genre.
        builder.HasMany(t => t.Genres).WithMany().UsingEntity<Dictionary<string, object>>(
            TrackGenresTable,
            right => right.HasOne<Genre>().WithMany().HasForeignKey(GenreIdColumn).OnDelete(DeleteBehavior.Cascade),
            left => left.HasOne<Track>().WithMany().HasForeignKey(TrackIdColumn).OnDelete(DeleteBehavior.Cascade),
            join =>
            {
                join.ToTable(TrackGenresTable, DbSchemas.Catalogue);
                join.HasKey(TrackIdColumn, GenreIdColumn);
                // Les genres d'un morceau se lisent par son identifiant : la clé commence par lui. Les morceaux d'un genre, par l'index suivant.
                join.HasIndex(GenreIdColumn);
            });
    }

    /// <summary>Table de jonction morceau ↔ genre.</summary>
    public const string TrackGenresTable = "track_genres";

    public const string TrackIdColumn = "track_id";

    public const string GenreIdColumn = "genre_id";
}

internal sealed class GenreConfiguration : IEntityTypeConfiguration<Genre>
{
    /// <summary>Clé primaire des genres, reconnue dans l'erreur d'unicité par <see cref="TrackConflictExceptionHandler"/> (deux ajouts qui écrivent le même genre neuf).</summary>
    public const string PrimaryKey = "pk_genres";

    public void Configure(EntityTypeBuilder<Genre> builder)
    {
        builder.ToTable("genres", DbSchemas.Catalogue);
        builder.HasKey(g => g.Id).HasName(PrimaryKey);
        // L'identifiant est celui de Deezer : jamais généré par la base.
        builder.Property(g => g.Id).ValueGeneratedNever();
        builder.Property(g => g.Name).IsRequired();
    }
}
