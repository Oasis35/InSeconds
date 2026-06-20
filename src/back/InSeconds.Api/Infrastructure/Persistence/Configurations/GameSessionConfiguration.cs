using InSeconds.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Persistence.Configurations;

public sealed class GameSessionConfiguration : IEntityTypeConfiguration<GameSession>
{
    public void Configure(EntityTypeBuilder<GameSession> builder)
    {
        builder.ToTable("GameSessions");

        builder.HasKey(s => s.Id);

        builder.Property(s => s.TotalScore).IsRequired();
        builder.Property(s => s.TotalDurationSeconds).IsRequired();
        builder.Property(s => s.CreatedAt).HasDefaultValueSql("now() at time zone 'utc'");

        builder.HasOne(s => s.Player)
            .WithMany(p => p.GameSessions)
            .HasForeignKey(s => s.PlayerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(s => s.DailyChallenge)
            .WithMany(d => d.GameSessions)
            .HasForeignKey(s => s.DailyChallengeId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(s => s.Answers)
            .WithOne(a => a.GameSession)
            .HasForeignKey(a => a.GameSessionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasQueryFilter(s => !s.Player.IsDeleted);

        builder.HasIndex(s => new { s.PlayerId, s.DailyChallengeId }).IsUnique();

        builder.HasIndex(s => new { s.DailyChallengeId, s.Status })
            .HasDatabaseName("IX_GameSessions_ChallengeStatus");

        builder.HasIndex(s => new { s.DailyChallengeId, s.TotalScore, s.TotalDurationSeconds })
            .IsDescending(false, true, false)
            .HasDatabaseName("IX_GameSessions_Leaderboard")
            .IncludeProperties(s => s.PlayerId);
    }
}
