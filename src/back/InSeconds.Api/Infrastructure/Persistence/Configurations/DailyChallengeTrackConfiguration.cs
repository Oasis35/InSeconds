using InSeconds.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Persistence.Configurations;

public sealed class DailyChallengeTrackConfiguration : IEntityTypeConfiguration<DailyChallengeTrack>
{
    public void Configure(EntityTypeBuilder<DailyChallengeTrack> builder)
    {
        builder.ToTable("DailyChallengeTracks");

        builder.HasKey(t => t.Id);

        builder.Property(t => t.DeezerRankSnapshot).IsRequired();
        builder.Property(t => t.Position).IsRequired();

        builder.HasOne(t => t.Track)
            .WithMany(tr => tr.DailyChallengeTracks)
            .HasForeignKey(t => t.TrackId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(t => new { t.DailyChallengeId, t.Position }).IsUnique();
        builder.HasIndex(t => new { t.DailyChallengeId, t.TrackId }).IsUnique();
    }
}
