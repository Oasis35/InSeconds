using InSeconds.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Persistence.Configurations;

public sealed class TrackConfiguration : IEntityTypeConfiguration<Track>
{
    public void Configure(EntityTypeBuilder<Track> builder)
    {
        builder.ToTable("Tracks");

        builder.HasKey(t => t.Id);

        builder.Property(t => t.DeezerTrackId).IsRequired();
        builder.Property(t => t.Artist).HasMaxLength(200).IsRequired();
        builder.Property(t => t.Title).HasMaxLength(300).IsRequired();

        builder.Property(t => t.CreatedAt)
            .HasDefaultValueSql("now() at time zone 'utc'");

        builder.HasIndex(t => t.DeezerTrackId).IsUnique();
    }
}
