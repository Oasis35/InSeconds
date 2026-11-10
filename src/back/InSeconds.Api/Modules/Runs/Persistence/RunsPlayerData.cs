using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Players.Contracts;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Runs.Persistence;

/// <summary>
/// Runs comme contributeur aux droits d'un joueur (RGPD) : sa section « runs » de la copie de ses données (parties, défis créés, record, accès) et
/// l'effacement de ses parties (réponses, difficultés des manches, cartes), record et accès ; les défis qu'il a créés restent jouables (<c>created_by</c> à <c>null</c>). Appelé par
/// Players dans sa propre transaction.
/// </summary>
public sealed class RunsPlayerData(InSecondsDbContext db, Catalogue.Contracts.ITrackDirectory directory) : IPlayerDataContributor
{
    public const string ModuleName = "runs";

    public string Module => ModuleName;

    public async Task<object> ExportAsync(Guid playerId, CancellationToken ct)
    {
        var sessions = await (
                from session in db.Set<RunSession>().AsNoTracking().Include(s => s.Answers).Include(s => s.Rounds).Include(s => s.Cards).AsSplitQuery()
                join challenge in db.Set<RunChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                where session.PlayerId == playerId
                orderby session.StartedAt
                select new { Session = session, challenge.Code })
            .ToListAsync(ct);
        // Le morceau qu'un Échange a mis à la place, désigné par son identifiant Deezer (l'identifiant interne ne dit rien au joueur).
        var replacements = sessions.SelectMany(row => row.Session.Cards).Where(c => c.ReplacementTrackId is not null)
            .Select(c => c.ReplacementTrackId!.Value).Distinct().ToList();
        var deezerIds = replacements.Count == 0 ? new Dictionary<int, Catalogue.Contracts.TrackInfo>() : await directory.GetAsync(replacements, ct);
        var games = sessions.Select(row => new RunGameExport(
            row.Code, row.Session.Status.ToString(), row.Session.StartedAt, row.Session.EndedAt, row.Session.RoundsPassed, row.Session.TotalScore,
            [.. row.Session.Answers.OrderBy(a => a.Position)
                .Select(a => new RunAnswerExport(a.Position, a.ArtistCorrect, a.TitleCorrect, a.Points, a.Neutralized, a.AnsweredAt))],
            [.. row.Session.Rounds.OrderBy(r => r.Round)
                .Select(r => new RunRoundExport(r.Round, RunDifficulties.KeyOf(r.Difficulty), r.ChosenAt))],
            [.. row.Session.Cards.OrderBy(c => c.Slot)
                .Select(c => new RunCardExport(
                    RunCards.KeyOf(c.Card), c.AcquiredRound, c.AcquiredAt, c.DroppedAt, c.PlayedAt, c.PlayedPosition, c.PlayedRound, c.PlayOrder,
                    c.ReplacementTrackId is { } id && deezerIds.TryGetValue(id, out var info) ? info.DeezerTrackId : null, c.DroppedAfterRound))])).ToList();

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

    // Exécuté tout de suite, dans la transaction de l'appelant. Le record référence une partie : il part avant elles ; les réponses, les difficultés
    // des manches et les cartes partent avec leur partie (cascade).
    public async Task<int> DeleteAsync(Guid playerId, CancellationToken ct)
    {
        await db.Set<RunRecord>().Where(r => r.PlayerId == playerId).ExecuteDeleteAsync(ct);
        var games = await db.Set<RunSession>().Where(s => s.PlayerId == playerId).ExecuteDeleteAsync(ct);
        await db.Set<RunAccess>().Where(a => a.PlayerId == playerId).ExecuteDeleteAsync(ct);
        await db.Set<RunChallenge>().Where(c => c.CreatedBy == playerId).ExecuteUpdateAsync(s => s.SetProperty(c => c.CreatedBy, (Guid?)null), ct);
        return games;
    }
}
