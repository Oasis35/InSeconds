using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Runs.Persistence;

/// <summary>
/// Runs comme contributeur aux droits d'un joueur (RGPD) : sa section « runs » de la copie de ses données (parties, défis créés, record, accès) et
/// l'effacement de ses parties, réponses, record et accès ; les défis qu'il a créés restent jouables (<c>created_by</c> à <c>null</c>). Appelé par
/// Players dans sa propre transaction.
/// </summary>
public sealed class RunsPlayerData(InSecondsDbContext db) : IPlayerDataContributor
{
    public const string ModuleName = "runs";

    public string Module => ModuleName;

    public async Task<object> ExportAsync(Guid playerId, CancellationToken ct)
    {
        var sessions = await (
                from session in db.Set<RunSession>().AsNoTracking().Include(s => s.Answers)
                join challenge in db.Set<RunChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                where session.PlayerId == playerId
                orderby session.StartedAt
                select new { Session = session, challenge.Code })
            .ToListAsync(ct);
        var games = sessions.Select(row => new RunGameExport(
            row.Code, row.Session.Status.ToString(), row.Session.StartedAt, row.Session.EndedAt, row.Session.RoundsPassed, row.Session.TotalScore,
            [.. row.Session.Answers.OrderBy(a => a.Position)
                .Select(a => new RunAnswerExport(a.Position, a.ArtistCorrect, a.TitleCorrect, a.Points, a.Neutralized, a.AnsweredAt))])).ToList();

        var created = await db.Set<RunChallenge>().AsNoTracking()
            .Where(c => c.CreatedBy == playerId).OrderBy(c => c.CreatedAt)
            .Select(c => new RunChallengeExport(c.Code, c.CreatedAt))
            .ToListAsync(ct);
        var record = await db.Set<RunRecord>().AsNoTracking().Where(r => r.PlayerId == playerId)
            .Select(r => new RunRecordExport(r.BestScore, r.BestRoundsPassed, r.AchievedAt))
            .FirstOrDefaultAsync(ct);
        var access = await db.Set<RunAccess>().AsNoTracking().Where(a => a.PlayerId == playerId)
            .Select(a => (DateTimeOffset?)a.GrantedAt)
            .FirstOrDefaultAsync(ct);

        return new RunsDataExport(games, created, record, access);
    }

    // Exécuté tout de suite, dans la transaction de l'appelant. Le record référence une partie : il part avant elles ; les réponses partent avec leur partie.
    public async Task<int> DeleteAsync(Guid playerId, CancellationToken ct)
    {
        await db.Set<RunRecord>().Where(r => r.PlayerId == playerId).ExecuteDeleteAsync(ct);
        var games = await db.Set<RunSession>().Where(s => s.PlayerId == playerId).ExecuteDeleteAsync(ct);
        await db.Set<RunAccess>().Where(a => a.PlayerId == playerId).ExecuteDeleteAsync(ct);
        await db.Set<RunChallenge>().Where(c => c.CreatedBy == playerId).ExecuteUpdateAsync(s => s.SetProperty(c => c.CreatedBy, (Guid?)null), ct);
        return games;
    }
}
