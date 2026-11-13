using System.Text.Json;
using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Modules.Runs.Persistence;

// Tables du schéma runs. Les clés étrangères vers players.players et catalogue.tracks sont déclarées ici **par le nom du type** : Runs n'utilise des
// autres modules que leur dossier Contracts (comme Daily).

internal sealed class RunChallengeConfiguration : IEntityTypeConfiguration<RunChallenge>
{
    /// <summary>Index unique du code : le lien d'un défi.</summary>
    public const string CodeIndex = "ix_challenges_code";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public void Configure(EntityTypeBuilder<RunChallenge> builder)
    {
        builder.ToTable("challenges", DbSchemas.Runs);
        builder.HasKey(c => c.Id);
        // Identifiant tiré d'une séquence dès l'ajout : la création d'un run le porte avant l'enregistrement par Wolverine.
        builder.Property(c => c.Id).UseHiLo("challenges_hilo", DbSchemas.Runs);
        builder.Property(c => c.Code).HasColumnType("char(6)").IsRequired();
        builder.HasIndex(c => c.Code).IsUnique().HasDatabaseName(CodeIndex);
        // Les règles figées au tirage, en jsonb : un réglage changé ensuite ne touche jamais un défi existant.
        builder.Property(c => c.Rules).HasColumnType("jsonb").IsRequired()
            .HasConversion(
                rules => JsonSerializer.Serialize(rules, Json),
                text => JsonSerializer.Deserialize<RunRules>(text, Json)!,
                new ValueComparer<RunRules>(
                    (a, b) => JsonSerializer.Serialize(a, Json) == JsonSerializer.Serialize(b, Json),
                    rules => JsonSerializer.Serialize(rules, Json).GetHashCode(StringComparison.Ordinal),
                    rules => JsonSerializer.Deserialize<RunRules>(JsonSerializer.Serialize(rules, Json), Json)!));
        // L'auteur disparaît avec son compte, le défi reste jouable.
        builder.HasOne("InSeconds.Api.Modules.Players.Domain.Player", navigationName: null).WithMany()
            .HasForeignKey(nameof(RunChallenge.CreatedBy)).OnDelete(DeleteBehavior.SetNull);
        builder.HasMany(c => c.Tracks).WithOne().HasForeignKey(t => t.ChallengeId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(c => c.Tracks).UsePropertyAccessMode(PropertyAccessMode.Field);
        builder.HasMany(c => c.Reserve).WithOne().HasForeignKey(t => t.ChallengeId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(c => c.Reserve).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class RunChallengeReserveTrackConfiguration : IEntityTypeConfiguration<RunChallengeReserveTrack>
{
    public void Configure(EntityTypeBuilder<RunChallengeReserveTrack> builder)
    {
        builder.ToTable("challenge_reserve_tracks", DbSchemas.Runs);
        builder.HasKey(t => new { t.ChallengeId, t.Round, t.Rank });
        // Un morceau ne figure qu'une fois dans la réserve d'un défi (le domaine refuse aussi un morceau à la fois joué et en réserve).
        builder.HasIndex(t => new { t.ChallengeId, t.TrackId }).IsUnique();
        builder.HasIndex(t => t.TrackId);
        builder.HasOne("InSeconds.Api.Modules.Catalogue.Domain.Track", navigationName: null).WithMany()
            .HasForeignKey(nameof(RunChallengeReserveTrack.TrackId)).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RunChallengeTrackConfiguration : IEntityTypeConfiguration<RunChallengeTrack>
{
    public void Configure(EntityTypeBuilder<RunChallengeTrack> builder)
    {
        builder.ToTable("challenge_tracks", DbSchemas.Runs);
        builder.HasKey(t => new { t.ChallengeId, t.Position });
        builder.Property(t => t.Multiplier).HasPrecision(3, 2);
        // Un morceau ne figure qu'une fois dans un défi ; l'index sur le morceau sert à l'usage (suppression refusée d'un morceau joué).
        builder.HasIndex(t => new { t.ChallengeId, t.TrackId }).IsUnique();
        builder.HasIndex(t => t.TrackId);
        builder.HasOne("InSeconds.Api.Modules.Catalogue.Domain.Track", navigationName: null).WithMany()
            .HasForeignKey(nameof(RunChallengeTrack.TrackId)).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RunSessionConfiguration : IEntityTypeConfiguration<RunSession>
{
    /// <summary>Index unique <c>(défi, joueur)</c> : un défi se joue une fois par joueur.</summary>
    public const string ChallengePlayerIndex = "ix_sessions_challenge_player";

    public void Configure(EntityTypeBuilder<RunSession> builder)
    {
        builder.ToTable("sessions", DbSchemas.Runs, table => table.HasCheckConstraint("ck_sessions_status", "status IN (0, 1, 2, 3)"));
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).UseHiLo("sessions_hilo", DbSchemas.Runs);
        // status : 0 en cours, 1 gagnée, 2 perdue, 3 abandonnée.
        builder.Property(s => s.Status).HasConversion<short>();
        builder.Property(s => s.CurrentListenedSeconds).HasPrecision(4, 2);
        builder.HasIndex(s => new { s.ChallengeId, s.PlayerId }).IsUnique().HasDatabaseName(ChallengePlayerIndex);
        builder.HasIndex(s => new { s.PlayerId, s.Status });
        builder.HasOne<RunChallenge>().WithMany().HasForeignKey(s => s.ChallengeId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne("InSeconds.Api.Modules.Players.Domain.Player", navigationName: null).WithMany()
            .HasForeignKey(nameof(RunSession.PlayerId)).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(s => s.Answers).WithOne().HasForeignKey(a => a.SessionId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(s => s.Answers).UsePropertyAccessMode(PropertyAccessMode.Field);
        builder.HasMany(s => s.Rounds).WithOne().HasForeignKey(r => r.SessionId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(s => s.Rounds).UsePropertyAccessMode(PropertyAccessMode.Field);
        builder.HasMany(s => s.Cards).WithOne().HasForeignKey(c => c.SessionId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(s => s.Cards).UsePropertyAccessMode(PropertyAccessMode.Field);
        // La main est tirée de Cards : pas une relation (EF la prendrait pour une seconde clé étrangère vers session_cards).
        builder.Ignore(s => s.Hand);
    }
}

internal sealed class RunSessionCardConfiguration : IEntityTypeConfiguration<RunSessionCard>
{
    public void Configure(EntityTypeBuilder<RunSessionCard> builder)
    {
        // card : 1 QCM, 2 Échange (jamais en main : une ligne par échange fait), 3 indice, 5 prolongation ; 4 et 6 à 10 : anciennes cartes, sans effet.
        builder.ToTable("session_cards", DbSchemas.Runs, table => table.HasCheckConstraint("ck_session_cards_card", "card BETWEEN 1 AND 10"));
        builder.HasKey(c => new { c.SessionId, c.Slot });
        builder.Property(c => c.Card).HasConversion<short>();
        // Échange : le morceau de la réserve joué à la place, qui ne se supprime pas tant qu'une partie l'a joué.
        builder.HasOne("InSeconds.Api.Modules.Catalogue.Domain.Track", navigationName: null).WithMany()
            .HasForeignKey(nameof(RunSessionCard.ReplacementTrackId)).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RunSessionRoundConfiguration : IEntityTypeConfiguration<RunSessionRound>
{
    public void Configure(EntityTypeBuilder<RunSessionRound> builder)
    {
        // difficulty : 1 facile, 2 sûre, 3 risquée. Une ligne par manche à choix : la difficulté ne se choisit qu'une fois.
        builder.ToTable("session_rounds", DbSchemas.Runs, table => table.HasCheckConstraint("ck_session_rounds_difficulty", "difficulty IN (1, 2, 3)"));
        builder.HasKey(r => new { r.SessionId, r.Round });
        builder.Property(r => r.Difficulty).HasConversion<short>();
    }
}

internal sealed class RunAnswerConfiguration : IEntityTypeConfiguration<RunAnswer>
{
    public void Configure(EntityTypeBuilder<RunAnswer> builder)
    {
        builder.ToTable("answers", DbSchemas.Runs);
        // Une réponse par morceau et par partie : le double envoi d'une même réponse ne passe jamais.
        builder.HasKey(a => new { a.SessionId, a.Position });
    }
}

internal sealed class RunRecordConfiguration : IEntityTypeConfiguration<RunRecord>
{
    public void Configure(EntityTypeBuilder<RunRecord> builder)
    {
        builder.ToTable("records", DbSchemas.Runs);
        builder.HasKey(r => r.PlayerId);
        builder.HasOne("InSeconds.Api.Modules.Players.Domain.Player", navigationName: null).WithMany()
            .HasForeignKey(nameof(RunRecord.PlayerId)).OnDelete(DeleteBehavior.Restrict);
        // La partie qui a établi le record : supprimée avec le joueur, jamais avant son record (l'effacement retire le record d'abord).
        builder.HasOne<RunSession>().WithMany().HasForeignKey(r => r.SessionId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RunLevelConfiguration : IEntityTypeConfiguration<RunLevel>
{
    public void Configure(EntityTypeBuilder<RunLevel> builder)
    {
        builder.ToTable("player_levels", DbSchemas.Runs);
        builder.HasKey(l => l.PlayerId);
        builder.Property(l => l.RecentScores).HasColumnType("integer[]").IsRequired();
        builder.HasOne("InSeconds.Api.Modules.Players.Domain.Player", navigationName: null).WithMany()
            .HasForeignKey(nameof(RunLevel.PlayerId)).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RunAccessConfiguration : IEntityTypeConfiguration<RunAccess>
{
    public void Configure(EntityTypeBuilder<RunAccess> builder)
    {
        builder.ToTable("access", DbSchemas.Runs);
        builder.HasKey(a => a.PlayerId);
        builder.HasOne("InSeconds.Api.Modules.Players.Domain.Player", navigationName: null).WithMany()
            .HasForeignKey(nameof(RunAccess.PlayerId)).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RunReceivedChallengeConfiguration : IEntityTypeConfiguration<RunReceivedChallenge>
{
    public void Configure(EntityTypeBuilder<RunReceivedChallenge> builder)
    {
        builder.ToTable("received_challenges", DbSchemas.Runs);
        builder.HasKey(r => new { r.PlayerId, r.ChallengeId });
        builder.HasOne("InSeconds.Api.Modules.Players.Domain.Player", navigationName: null).WithMany()
            .HasForeignKey(nameof(RunReceivedChallenge.PlayerId)).OnDelete(DeleteBehavior.Restrict);
        // Le défi supprime ses rappels avec lui.
        builder.HasOne<RunChallenge>().WithMany().HasForeignKey(r => r.ChallengeId).OnDelete(DeleteBehavior.Cascade);
    }
}
