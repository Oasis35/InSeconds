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
