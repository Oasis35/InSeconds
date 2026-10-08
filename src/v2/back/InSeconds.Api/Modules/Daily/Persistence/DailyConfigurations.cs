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

internal sealed class DailySessionConfiguration : IEntityTypeConfiguration<DailySession>
{
    /// <summary>Index unique <c>(joueur, défi)</c> : une seule partie par joueur et par défi, la règle anti-rejeu.</summary>
    public const string PlayerChallengeIndex = "ix_sessions_player_challenge";

    public void Configure(EntityTypeBuilder<DailySession> builder)
    {
        builder.ToTable("sessions", DbSchemas.Daily, table => table.HasCheckConstraint("ck_sessions_status", "status IN (0, 1, 2, 3)"));
        builder.HasKey(s => s.Id);
        // Identifiant tiré d'une séquence dès l'ajout : la réponse de démarrage le porte avant l'enregistrement par Wolverine.
        builder.Property(s => s.Id).UseHiLo("sessions_hilo", DbSchemas.Daily);
        // status : 0 en cours, 1 terminée, 2 abandonnée, 3 expirée.
        builder.Property(s => s.Status).HasConversion<short>();
        builder.Property(s => s.TotalListenedSeconds).HasPrecision(6, 2);
        builder.Property(s => s.CurrentListenedSeconds).HasPrecision(4, 2);
        builder.Property(s => s.CurrentHintLevel).HasDefaultValue((short)0);
        builder.Property(s => s.FreezesUsed).HasDefaultValue((short)0);
        builder.Property(s => s.FreezeEarned).HasDefaultValue(false);
        builder.HasIndex(s => new { s.PlayerId, s.ChallengeId }).IsUnique().HasDatabaseName(PlayerChallengeIndex);
        builder.HasIndex(s => new { s.ChallengeId, s.Status });
        builder.HasOne<DailyChallenge>().WithMany().HasForeignKey(s => s.ChallengeId).OnDelete(DeleteBehavior.Restrict);
        // La clé étrangère vers le joueur est déclarée par le nom du type : Daily n'utilise de Players que son dossier Contracts.
        builder.HasOne("InSeconds.Api.Modules.Players.Domain.Player", navigationName: null).WithMany().HasForeignKey(nameof(DailySession.PlayerId)).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(s => s.Answers).WithOne().HasForeignKey(a => a.SessionId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(s => s.Answers).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class SessionAnswerConfiguration : IEntityTypeConfiguration<SessionAnswer>
{
    public void Configure(EntityTypeBuilder<SessionAnswer> builder)
    {
        builder.ToTable("answers", DbSchemas.Daily);
        // Une réponse par morceau et par partie : le double envoi d'une même réponse ne passe jamais.
        builder.HasKey(a => new { a.SessionId, a.Position });
        builder.Property(a => a.ListenedSeconds).HasPrecision(4, 2);
    }
}

internal sealed class DailyStreakConfiguration : IEntityTypeConfiguration<DailyStreak>
{
    public void Configure(EntityTypeBuilder<DailyStreak> builder)
    {
        builder.ToTable("streaks", DbSchemas.Daily);
        builder.HasKey(s => s.PlayerId);
        builder.Property(s => s.Freezes).HasDefaultValue((short)0);
        builder.HasOne("InSeconds.Api.Modules.Players.Domain.Player", navigationName: null).WithMany()
            .HasForeignKey(nameof(DailyStreak.PlayerId)).OnDelete(DeleteBehavior.Restrict);
    }
}
