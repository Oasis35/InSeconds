using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InSeconds.Api.Infrastructure.Operations;

/// <summary>Écrite par les scripts shell de <c>deploy/infra</c> : un changement de colonne doit les suivre (<c>record_run</c> de <c>backup-common.sh</c>).</summary>
internal sealed class BackupRunConfiguration : IEntityTypeConfiguration<BackupRun>
{
    public void Configure(EntityTypeBuilder<BackupRun> builder)
    {
        builder.ToTable("backup_runs", DbSchemas.Infra, t =>
        {
            t.HasCheckConstraint("ck_backup_runs_kind", "kind IN ('backup', 'verify', 'archive')");
            t.HasCheckConstraint("ck_backup_runs_outcome", "outcome IN ('ok', 'failed')");
        });
        builder.HasKey(b => b.Id);
        builder.Property(b => b.Id).UseIdentityAlwaysColumn();
        // Valeurs par défaut : les lignes d'avant le contrôle de restauration sont des sauvegardes réussies.
        builder.Property(b => b.Kind).HasMaxLength(16).HasDefaultValue(BackupRunKinds.Backup);
        builder.Property(b => b.Outcome).HasMaxLength(16).HasDefaultValue(BackupRunOutcomes.Ok);
        builder.Property(b => b.FailedStep).HasMaxLength(32);
        builder.Property(b => b.Message).HasMaxLength(500);
        builder.Property(b => b.DumpName).HasMaxLength(200);
        builder.HasIndex(b => new { b.Kind, b.FinishedAt });
    }
}
