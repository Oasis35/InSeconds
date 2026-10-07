using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Daily.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Modules.Daily.Persistence;

// Tables du schéma daily (§ 4.4 du plan v2). La clé étrangère vers catalogue.tracks est déclarée ici (c'est Daily qui
// référence les morceaux), **par le nom du type** : Daily n'utilise de Catalogue que son dossier Contracts.

internal sealed class DailyChallengeConfiguration : IEntityTypeConfiguration<DailyChallenge>
{
    /// <summary>Index unique de la date : un seul défi par jour.</summary>
    public const string DateIndex = "ix_challenges_date";

    public void Configure(EntityTypeBuilder<DailyChallenge> builder)
    {
        builder.ToTable("challenges", DbSchemas.Daily);
        builder.HasKey(c => c.Id);
        // Identifiant tiré d'une séquence dès l'ajout : le compte rendu de la génération le porte avant l'enregistrement.
        builder.Property(c => c.Id).UseHiLo("challenges_hilo", DbSchemas.Daily);
        builder.Property(c => c.Date).IsRequired();
        builder.HasIndex(c => c.Date).IsUnique().HasDatabaseName(DateIndex);
        // origin : 1 nocturne, 2 à la volée, 3 admin ; vide pour l'historique repris.
        builder.Property(c => c.Origin).HasConversion<short?>();
        builder.HasMany(c => c.Tracks).WithOne().HasForeignKey(t => t.ChallengeId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(c => c.Tracks).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class ChallengeTrackConfiguration : IEntityTypeConfiguration<ChallengeTrack>
{
    public void Configure(EntityTypeBuilder<ChallengeTrack> builder)
    {
        builder.ToTable("challenge_tracks", DbSchemas.Daily);
        builder.HasKey(t => new { t.ChallengeId, t.Position });
        // Un morceau ne figure qu'une fois dans un défi ; l'index sur le morceau sert au calcul du cooldown.
        builder.HasIndex(t => new { t.ChallengeId, t.TrackId }).IsUnique();
        builder.HasIndex(t => t.TrackId);
        builder.HasOne("InSeconds.Api.Modules.Catalogue.Domain.Track", navigationName: null).WithMany()
            .HasForeignKey(nameof(ChallengeTrack.TrackId)).OnDelete(DeleteBehavior.Restrict);
    }
}
