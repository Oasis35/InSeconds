using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Wolverine.Http;

namespace InSeconds.Api.Infrastructure.Operations;

/// <summary>L'état technique de l'API, tel que l'admin l'affiche.</summary>
/// <param name="Commit">Commit déployé (posé au build de l'image par <c>deploy.sh</c>) ; vide hors d'une image de prod ou de staging.</param>
/// <param name="LastBackupAt">Fin de la dernière sauvegarde réussie de la base ; vide au staging (aucune sauvegarde) ou s'il n'y en a jamais eu.</param>
/// <param name="LastBackupOffSite">La dernière sauvegarde réussie a quitté le VPS (R2) ; vide sans sauvegarde.</param>
/// <param name="BackupFailure">Le dernier passage de la sauvegarde, s'il a échoué ; vide s'il a réussi.</param>
/// <param name="LastRestoreTestAt">Fin du dernier contrôle de restauration réussi (<c>backup-verify.sh</c>) ; vide s'il n'y en a jamais eu.</param>
/// <param name="RestoreTestFailure">Le dernier contrôle de restauration, s'il a échoué ; vide s'il a réussi.</param>
public sealed record SystemInfoResponse(
    string? Commit,
    DateTimeOffset? LastBackupAt,
    bool? LastBackupOffSite,
    BackupFailureResponse? BackupFailure,
    DateTimeOffset? LastRestoreTestAt,
    BackupFailureResponse? RestoreTestFailure);

/// <summary>Un passage en échec des scripts de sauvegarde : quand, à quelle étape, et le message court (le journal complet est dans Grafana).</summary>
public sealed record BackupFailureResponse(DateTimeOffset At, string? Step, string? Message);

public static class GetSystemInfoEndpoint
{
    /// <summary><c>GET /api/admin/system</c> : le commit de l'API, la dernière sauvegarde de la base et son dernier contrôle de restauration.</summary>
    [WolverineGet("/api/admin/system", OperationId = "getSystemInfo")]
    public static async Task<SystemInfoResponse> Get(InSecondsDbContext db, CancellationToken ct)
    {
        var runs = db.Set<BackupRun>().AsNoTracking();
        var lastBackup = await LastSuccessAsync(runs, BackupRunKinds.Backup, ct);
        var lastRestoreTest = await LastSuccessAsync(runs, BackupRunKinds.Verify, ct);
        return new SystemInfoResponse(
            BuildInfo.Commit,
            lastBackup?.FinishedAt,
            lastBackup?.OffSite,
            await LastFailureAsync(runs, BackupRunKinds.Backup, ct),
            lastRestoreTest?.FinishedAt,
            await LastFailureAsync(runs, BackupRunKinds.Verify, ct));
    }

    private static Task<BackupRun?> LastSuccessAsync(IQueryable<BackupRun> runs, string kind, CancellationToken ct) =>
        runs.Where(r => r.Kind == kind && r.Outcome == BackupRunOutcomes.Ok)
            .OrderByDescending(r => r.FinishedAt)
            .FirstOrDefaultAsync(ct);

    /// <summary>Le dernier passage de ce type, s'il a échoué : un échec suivi d'une réussite n'est plus une alerte.</summary>
    private static async Task<BackupFailureResponse?> LastFailureAsync(IQueryable<BackupRun> runs, string kind, CancellationToken ct)
    {
        var last = await runs.Where(r => r.Kind == kind).OrderByDescending(r => r.FinishedAt).FirstOrDefaultAsync(ct);
        return last is { Outcome: BackupRunOutcomes.Failed } ? new BackupFailureResponse(last.FinishedAt, last.FailedStep, last.Message) : null;
    }
}
