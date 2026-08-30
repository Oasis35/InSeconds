using InSeconds.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Persistence.Configurations;

public sealed class MagicLinkTokenConfiguration : IEntityTypeConfiguration<MagicLinkToken>
{
    public void Configure(EntityTypeBuilder<MagicLinkToken> builder)
    {
        builder.ToTable("MagicLinkTokens");

        builder.HasKey(m => m.Id);

        builder.Property(m => m.Email).HasMaxLength(256).IsRequired();
        builder.Property(m => m.TokenHash).HasMaxLength(64).IsRequired();

        builder.Property(m => m.CreatedAt)
            .HasDefaultValueSql("now() at time zone 'utc'");

        builder.HasIndex(m => m.TokenHash).IsUnique();
    }
}
