using InSeconds.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Persistence.Configurations;

public sealed class AllowedEmailConfiguration : IEntityTypeConfiguration<AllowedEmail>
{
    public void Configure(EntityTypeBuilder<AllowedEmail> builder)
    {
        builder.ToTable("AllowedEmails");

        builder.HasKey(a => a.Id);

        builder.Property(a => a.Email).HasMaxLength(256).IsRequired();

        builder.Property(a => a.CreatedAt)
            .HasDefaultValueSql("now() at time zone 'utc'");

        builder.HasIndex(a => a.Email).IsUnique();
    }
}
