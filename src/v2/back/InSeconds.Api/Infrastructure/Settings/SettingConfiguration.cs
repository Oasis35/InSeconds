using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Settings;

internal sealed class SettingConfiguration : IEntityTypeConfiguration<Setting>
{
    public void Configure(EntityTypeBuilder<Setting> builder)
    {
        builder.ToTable("settings", DbSchemas.Infra);
        builder.HasKey(s => s.Key);
        builder.Property(s => s.Key).HasMaxLength(200);
        builder.Property(s => s.ValueJson).HasColumnName("value").HasColumnType("jsonb").IsRequired();
        builder.Property(s => s.Description);
        builder.Property(s => s.UpdatedAt);
    }
}
