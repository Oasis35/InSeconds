using InSeconds.Api.Infrastructure.Hosting;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Wolverine.Http;

namespace InSeconds.Api.Infrastructure.Operations;

/// <summary>L'état technique de l'API, tel que l'admin l'affiche.</summary>
/// <param name="Commit">Commit déployé (posé au build de l'image par <c>deploy.sh</c>) ; vide hors d'une image de prod ou de staging.</param>
/// <param name="LastBackupAt">Fin de la dernière sauvegarde réussie de la base ; vide au staging (aucune sauvegarde) ou s'il n'y en a jamais eu.</param>
/// <param name="LastBackupOffSite">La dernière sauvegarde a quitté le VPS (R2) ; vide sans sauvegarde.</param>
public sealed record SystemInfoResponse(string? Commit, DateTimeOffset? LastBackupAt, bool? LastBackupOffSite);

public static class GetSystemInfoEndpoint
{
    /// <summary><c>GET /api/admin/system</c> : le commit de l'API et la dernière sauvegarde de la base.</summary>
    [WolverineGet("/api/admin/system", OperationId = "getSystemInfo")]
    public static async Task<SystemInfoResponse> Get(InSecondsDbContext db, CancellationToken ct)
    {
        var last = await db.Set<BackupRun>().AsNoTracking()
            .OrderByDescending(b => b.FinishedAt)
            .Select(b => new { b.FinishedAt, b.OffSite })
            .FirstOrDefaultAsync(ct);
        return new SystemInfoResponse(BuildInfo.Commit, last?.FinishedAt, last?.OffSite);
    }
}
