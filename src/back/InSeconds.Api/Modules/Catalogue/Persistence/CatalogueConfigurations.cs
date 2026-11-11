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
        // alt_titles : text[], les autres titres acceptés comme bonne réponse (vide par défaut).
        builder.Property(t => t.AltTitles).HasColumnType("text[]").HasDefaultValueSql("'{}'::text[]");
        // preview_status : 0 inconnu, 1 disponible, 2 absent.
        builder.Property(t => t.PreviewStatus).HasConversion<short>();
        // album_id : l'album chez Deezer (les genres se lisent sur lui) ; genres_checked_at : vide tant que ses genres n'ont pas été lus.
        builder.Property(t => t.AlbumId);
        builder.Property(t => t.GenresCheckedAt);
        // genres_manual : le genre a été saisi par l'admin (relu chez Deezer chaque mois).
        builder.Property(t => t.GenresManual).HasDefaultValue(false);
        // Les thèmes que l'admin a associés au morceau (Runs en tire les playlists à thème) : table de jonction track_themes, supprimée avec le morceau ;
        // un thème que des morceaux ont ne se supprime pas (Restrict).
        builder.HasMany(t => t.Themes).WithMany().UsingEntity<Dictionary<string, object>>(
            TrackThemesTable,
            right => right.HasOne<Theme>().WithMany().HasForeignKey(ThemeIdColumn).OnDelete(DeleteBehavior.Restrict),
            left => left.HasOne<Track>().WithMany().HasForeignKey(TrackIdColumn).OnDelete(DeleteBehavior.Cascade),
            join =>
            {
                join.ToTable(TrackThemesTable, DbSchemas.Catalogue);
                join.HasKey(TrackIdColumn, ThemeIdColumn);
                // Les morceaux d'un thème se lisent par l'index suivant (les thèmes d'un morceau, par la clé).
                join.HasIndex(ThemeIdColumn);
            });
        // La forme de l'extrait : un blob de quelques Ko (bytea), le nom du fichier dont elle vient et sa date. Les requêtes du pool et des modes
        // ne lisent jamais l'entité entière (projections) : ce blob ne voyage qu'avec le contrôle nocturne et la réponse de démarrage.
        builder.Property(t => t.Waveform);
        builder.Property(t => t.WaveformSource).HasMaxLength(120);
        builder.Property(t => t.WaveformComputedAt);
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

    /// <summary>Table de jonction morceau ↔ thème.</summary>
    public const string TrackThemesTable = "track_themes";

    public const string ThemeIdColumn = "theme_id";

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

internal sealed class ThemeConfiguration : IEntityTypeConfiguration<Theme>
{
    /// <summary>Index unique du nom, reconnu dans l'erreur d'unicité (deux ajouts du même nom en même temps).</summary>
    public const string NameIndex = "ix_themes_name";

    public void Configure(EntityTypeBuilder<Theme> builder)
    {
        builder.ToTable("themes", DbSchemas.Catalogue);
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Id).UseHiLo("themes_hilo", DbSchemas.Catalogue);
        // citext : « Films » et « films » sont le même thème (le schéma extensions est dans le search_path).
        builder.Property(t => t.Name).IsRequired().HasMaxLength(Theme.MaxNameLength).HasColumnType("citext");
        builder.HasIndex(t => t.Name).IsUnique().HasDatabaseName(NameIndex);
        builder.Property(t => t.Icon).HasMaxLength(Theme.MaxIconLength);
        builder.Property(t => t.CreatedAt).IsRequired();
    }
}
