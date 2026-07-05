using InSeconds.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Persistence.Configurations;

public sealed class GameSessionAnswerConfiguration : IEntityTypeConfiguration<GameSessionAnswer>
{
    public void Configure(EntityTypeBuilder<GameSessionAnswer> builder)
    {
        builder.ToTable("GameSessionAnswers");

        builder.HasKey(a => a.Id);

        builder.Property(a => a.ListenedDurationSeconds).IsRequired();
        builder.Property(a => a.WasExtended).IsRequired();
        builder.Property(a => a.ArtistAnswer).HasMaxLength(200);
        builder.Property(a => a.TitleAnswer).HasMaxLength(300);
        builder.Property(a => a.ArtistCorrect).IsRequired();
        builder.Property(a => a.TitleCorrect).IsRequired();
        builder.Property(a => a.Score).IsRequired();

        builder.HasOne(a => a.Track)
            .WithMany(t => t.Answers)
            .HasForeignKey(a => a.DailyChallengeTrackId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasQueryFilter(a => !a.GameSession.Player.IsDeleted);

        builder.HasIndex(a => new { a.GameSessionId, a.DailyChallengeTrackId }).IsUnique();

        builder.HasIndex(a => a.DailyChallengeTrackId)
            .HasDatabaseName("IX_GameSessionAnswers_DailyChallengeTrackId");
    }
}
