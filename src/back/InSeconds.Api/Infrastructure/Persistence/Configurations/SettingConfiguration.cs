using InSeconds.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Persistence.Configurations;

public sealed class SettingConfiguration : IEntityTypeConfiguration<Setting>
{
    public void Configure(EntityTypeBuilder<Setting> builder)
    {
        builder.ToTable("Settings");

        builder.HasKey(s => s.Id);

        builder.Property(s => s.Key).HasMaxLength(100).IsRequired();
        builder.Property(s => s.Value).HasMaxLength(1000).IsRequired();
        builder.Property(s => s.Description).HasMaxLength(500);

        builder.Property(s => s.UpdatedAt)
            .HasDefaultValueSql("SYSUTCDATETIME()");

        builder.HasIndex(s => s.Key).IsUnique();

        builder.HasData(
            new Setting
            {
                Id = 1,
                Key = "GuessTimerSeconds",
                Value = "20",
                Description = "Temps de saisie autorisé après la fin de la lecture (en secondes).",
                UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            },
            new Setting
            {
                Id = 2,
                Key = "AllowedDurationsSeconds",
                Value = "1,2,3,5,10,15,30",
                Description = "Durées d'écoute proposées au joueur (CSV, en secondes).",
                UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            },
            new Setting
            {
                Id = 3,
                Key = "MaxExtensionsPerAnswer",
                Value = "1",
                Description = "Nombre maximal de prolongations autorisées par réponse.",
                UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            },
            new Setting
            {
                Id = 4,
                Key = "TracksPerChallenge",
                Value = "10",
                Description = "Nombre de morceaux dans un défi quotidien.",
                UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            }
        );
    }
}
