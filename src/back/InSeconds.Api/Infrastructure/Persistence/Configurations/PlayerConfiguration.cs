using InSeconds.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Persistence.Configurations;

public sealed class PlayerConfiguration : IEntityTypeConfiguration<Player>
{
    public void Configure(EntityTypeBuilder<Player> builder)
    {
        builder.ToTable("Players", t => t.HasCheckConstraint(
            "CK_Players_GuestPseudo",
            "(\"IsGuest\" = true AND \"Pseudo\" IS NULL) OR (\"IsGuest\" = false AND \"Pseudo\" IS NOT NULL)"));

        builder.HasKey(p => p.Id);

        builder.Property(p => p.IsGuest)
            .HasDefaultValue(false);

        builder.Property(p => p.Pseudo)
            .HasMaxLength(20);

        builder.Property(p => p.Email)
            .HasMaxLength(256);

        builder.Property(p => p.AuthToken)
            .IsRequired();

        builder.Property(p => p.CreatedAt)
            .HasDefaultValueSql("now() at time zone 'utc'");

        builder.Property(p => p.CurrentStreak)
            .HasDefaultValue(0);

        builder.Property(p => p.LastPlayedDate)
            .HasColumnType("date");

        builder.Property(p => p.IsDeleted)
            .HasDefaultValue(false);

        builder.HasIndex(p => p.AuthToken).IsUnique();

        builder.HasIndex(p => p.Pseudo)
            .IsUnique()
            .HasFilter("\"IsGuest\" = false AND \"Pseudo\" IS NOT NULL");

        builder.HasIndex(p => p.Email)
            .IsUnique()
            .HasFilter("\"Email\" IS NOT NULL");

        builder.HasQueryFilter(p => !p.IsDeleted);
    }
}
