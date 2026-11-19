using InSeconds.Api.Infrastructure.Persistence;
using InSeconds.Api.Infrastructure.Time;
using InSeconds.Api.Modules.Daily.Domain;
using InSeconds.Api.Modules.Social.Contracts;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Modules.Daily.Persistence;

/// <summary>
/// Ce que Daily donne au classement par score d'un groupe : le score du jour et les points de la semaine glissante de chaque membre, lus sur
/// <c>daily.sessions</c> (parties terminées) et la date de leur défi ; la règle est celle du domaine (<see cref="DailyPeriodScores"/>). Daily ne connaît
/// de Social que ce contrat.
/// </summary>
public sealed class DailyMemberScores(InSecondsDbContext db, IGameCalendar calendar) : IMemberScoreSource
{
    public string Source => "daily";

    public async Task<ModeScores> GetAsync(Guid viewerId, IReadOnlyCollection<Guid> playerIds, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(playerIds);
        var today = calendar.Today;
        // Ses parties sur les défis qu'il peut encore jouer (le jour, la veille) : elles décident des jours qu'il ne voit pas encore.
        var yesterday = today.AddDays(-1);
        var viewerGames = await (from session in db.Set<DailySession>().AsNoTracking()
                                 join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                                 where session.PlayerId == viewerId && challenge.Date >= yesterday && challenge.Date <= today
                                 select new ViewerGame(challenge.Date, session.Status, session.Answers.Count())).ToListAsync(ct);
        var hidden = DailyPeriodScores.HiddenDays(today, viewerGames);
        var revealed = !hidden.Contains(today);

        var ids = playerIds.Distinct().ToList();
        if (ids.Count == 0)
            return new ModeScores(today, revealed, new Dictionary<Guid, MemberPeriodScores>());

        var start = DailyPeriodScores.WeekStart(today, ScorePeriods.WeekDays);
        var games = await (from session in db.Set<DailySession>().AsNoTracking()
                           join challenge in db.Set<DailyChallenge>().AsNoTracking() on session.ChallengeId equals challenge.Id
                           where ids.Contains(session.PlayerId) && session.Status == SessionStatus.Completed
                                 && challenge.Date >= start && challenge.Date <= today
                           select new FinishedGame(session.PlayerId, challenge.Date, session.TotalScore)).ToListAsync(ct);
        var scores = DailyPeriodScores.Compute(games, today, ScorePeriods.WeekDays, hidden);
        return new ModeScores(today, revealed, scores.ToDictionary(
            s => s.Key, s => new MemberPeriodScores(s.Value.PlayedToday, s.Value.TodayScore, s.Value.WeekPoints, s.Value.WeekPlayedDays)));
    }
}
