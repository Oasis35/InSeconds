using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Catalogue.Contracts;
using InSeconds.Api.Modules.Daily.Application;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Players.Contracts;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

/// <summary>
/// Le Daily comme contributeur aux droits d'un joueur (RGPD) : sa section « daily » de la copie de ses données, et l'effacement de sa série et de
/// ses parties (et des défis affichés par un admin). Appelé par Players dans sa propre transaction.
/// </summary>
public sealed class DailyPlayerData(InSecondsDbContext db, ITrackDirectory tracks) : IPlayerDataContributor
{
    public const string ModuleName = "daily";

    public string Module => ModuleName;

    public async Task<object> ExportAsync(Guid playerId, CancellationToken ct)
    {
        var streak = await db.Set<DailyStreak>().AsNoTracking()
            .Where(s => s.PlayerId == playerId)
            .Select(s => new StreakExport(s.CurrentStreak, s.LastPlayedDate, s.Freezes))
            .FirstOrDefaultAsync(ct);

        var sessions = await (
                from session in db.Set<DailySession>().AsNoTracking().Include(s => s.Answers)
                join challenge in db.Set<DailyChallenge>().Include(c => c.Tracks) on session.ChallengeId equals challenge.Id
                where session.PlayerId == playerId
                orderby challenge.Date
                select new { Session = session, Challenge = challenge })
            .ToListAsync(ct);

        // Le morceau de chaque réponse : artiste et titre, lus par le contrat de Catalogue (un morceau supprimé depuis reste sans nom).
        var trackIds = sessions.SelectMany(s => s.Challenge.Tracks.Select(t => t.TrackId)).Distinct().ToList();
        var catalogue = trackIds.Count == 0 ? new Dictionary<int, TrackInfo>() : await tracks.GetAsync(trackIds, ct);

        var games = sessions.Select(row =>
        {
            var trackAt = row.Challenge.Tracks.ToDictionary(t => t.Position, t => t.TrackId);
            var answers = row.Session.Answers.OrderBy(a => a.Position).Select(a =>
            {
                var track = trackAt.TryGetValue(a.Position, out var id) ? catalogue.GetValueOrDefault(id) : null;
                return new GameTrackExport(
                    a.Position, track?.Artist, track?.DisplayTitle, a.ListenedSeconds, a.HintLevel, a.ArtistCorrect, a.TitleCorrect, a.Score, a.AnsweredAt);
            }).ToList();
            return new GameExport(
                row.Challenge.Date, row.Session.Status.ToString(), row.Session.StartedAt, row.Session.EndedAt, row.Session.TotalScore, answers);
        }).ToList();

        var revealed = await (
                from reveal in db.Set<ChallengeReveal>().AsNoTracking()
                join challenge in db.Set<DailyChallenge>().AsNoTracking() on reveal.ChallengeId equals challenge.Id
                where reveal.PlayerId == playerId
                orderby challenge.Date
                select challenge.Date)
            .ToListAsync(ct);

        return new DailyDataExport(streak, games, revealed);
    }

    // Exécuté tout de suite, dans la transaction de l'appelant. Les réponses partent avec leur partie (clé étrangère en cascade).
    public async Task<int> DeleteAsync(Guid playerId, CancellationToken ct)
    {
        var games = await db.Set<DailySession>().Where(s => s.PlayerId == playerId).ExecuteDeleteAsync(ct);
        await db.Set<DailyStreak>().Where(s => s.PlayerId == playerId).ExecuteDeleteAsync(ct);
        await db.Set<ChallengeReveal>().Where(r => r.PlayerId == playerId).ExecuteDeleteAsync(ct);
        return games;
    }
}
