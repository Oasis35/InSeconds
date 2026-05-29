using InSeconds.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Persistence.Configurations;

public sealed class DailyChallengeConfiguration : IEntityTypeConfiguration<DailyChallenge>
{
    public void Configure(EntityTypeBuilder<DailyChallenge> builder)
    {
        builder.ToTable("DailyChallenges");

        builder.HasKey(d => d.Id);

        builder.Property(d => d.Date).IsRequired();
        builder.Property(d => d.Seed).IsRequired();

        builder.HasIndex(d => d.Date).IsUnique();

        builder.HasMany(d => d.Tracks)
            .WithOne(t => t.DailyChallenge)
            .HasForeignKey(t => t.DailyChallengeId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
