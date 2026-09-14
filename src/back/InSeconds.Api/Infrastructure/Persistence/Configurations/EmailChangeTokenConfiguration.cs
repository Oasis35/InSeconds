using InSeconds.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Persistence.Configurations;

public sealed class EmailChangeTokenConfiguration : IEntityTypeConfiguration<EmailChangeToken>
{
    public void Configure(EntityTypeBuilder<EmailChangeToken> builder)
    {
        builder.ToTable("EmailChangeTokens");

        builder.HasKey(m => m.Id);

        builder.Property(m => m.NewEmail).HasMaxLength(256).IsRequired();
        builder.Property(m => m.TokenHash).HasMaxLength(64).IsRequired();

        builder.Property(m => m.CreatedAt)
            .HasDefaultValueSql("now() at time zone 'utc'");

        builder.HasIndex(m => m.TokenHash).IsUnique();
        builder.HasIndex(m => m.PlayerId);
    }
}
