using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Modules.Runs.Application;
using InSeconds.Api.Modules.Runs.Domain;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Runs.Persistence;

/// <summary>Ce que les Hits d'un joueur lisent : tout part de son identifiant ; d'un autre joueur, seulement les points de l'auteur d'une playlist qu'il a jouée.</summary>
public sealed class EfRunHitsQueries(InSecondsDbContext db) : IRunHitsQueries
{
    private IQueryable<RunSession> Finished() =>
        db.Set<RunSession>().AsNoTracking().Where(s => (s.Status == RunSessionStatus.Lost || s.Status == RunSessionStatus.Completed) && s.EndedAt != null);

    public async Task<RunHitFacts> GetFactsAsync(Guid playerId, CancellationToken ct)
    {
        var sessions = await Finished().Where(s => s.PlayerId == playerId)
            .Include(s => s.Answers)
            .OrderBy(s => s.EndedAt).ThenBy(s => s.Id)
            .ToListAsync(ct);
        var challengeIds = sessions.Select(s => s.ChallengeId).Distinct().ToList();
        var challenges = await db.Set<RunChallenge>().AsNoTracking().Include(c => c.Tracks)
            .Where(c => challengeIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, ct);

        // Les points de l'auteur, pour les playlists d'un ami qui l'a finie.
        var friendPoints = await (from session in Finished()
                                  join challenge in db.Set<RunChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                                  where challengeIds.Contains(challenge.Id) && challenge.CreatedBy != null && challenge.CreatedBy != playerId
                                      && session.PlayerId == challenge.CreatedBy
                                  select new { session.ChallengeId, Answers = session.Answers.Select(a => new { a.Position, a.Points }).ToList() })
            .ToDictionaryAsync(e => e.ChallengeId, e => (IReadOnlyDictionary<int, int>)e.Answers.ToDictionary(a => (int)a.Position, a => a.Points), ct);

        var friendPlayedMine = await (from session in Finished()
                                      join challenge in db.Set<RunChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                                      where challenge.CreatedBy == playerId && session.PlayerId != playerId
                                      select session.Id).AnyAsync(ct);

        var runs = sessions.Where(s => challenges.ContainsKey(s.ChallengeId)).Select(session =>
        {
            var challenge = challenges[session.ChallengeId];
            var rules = challenge.Rules;
            return new RunHitRun(
                session.TotalScore, rules.TracksPerRound,
                [.. session.Answers.OrderBy(a => a.Position).Select(a => new RunHitAnswer(
                    a.Position, rules.RoundOf(a.Position), a.ArtistCorrect && a.TitleCorrect, a.Neutralized,
                    rules.ListenAt(session.StepOf(rules, rules.RoundOf(a.Position))), a.IsFailed))],
                friendPoints.GetValueOrDefault(session.ChallengeId),
                rules.Themes?.Where(t => t.Mystery).Select(t => t.Round).ToHashSet());
        }).ToList();
        return new RunHitFacts(runs, friendPlayedMine);
    }
}
