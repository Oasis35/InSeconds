using InSeconds.Api.Domain;
using InSeconds.Api.Features.ChallengeGeneration;
using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Sessions.GetTodaySession;

/// <summary>
/// Lecture seule : ne crée jamais de Player, de cookie ni de session. Peut en revanche
/// déclencher la génération paresseuse du <see cref="DailyChallenge"/> (filet de sécurité
/// si le job de minuit a raté — cf. piège 19), qui ne touche aucune donnée joueur.
/// </summary>
public sealed class GetTodaySessionHandler(
    ApplicationDbContext db,
    DailyChallengeGenerator challengeGenerator,
    ILogger<GetTodaySessionHandler> logger)
{
    public async Task<GetTodaySessionResponse> Handle(Guid? playerId, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var row = await QueryAsync(today, playerId, ct)
                  ?? await TryLazyGenerateAsync(today, playerId, ct);

        if (row is null)
            return new GetTodaySessionResponse("no_challenge", 0, 0, 0);

        var state = row.SessionStatus switch
        {
            null                    => "can_start",
            SessionStatus.Pending   => "resumable",
            SessionStatus.Completed => "already_played",
            _                       => "abandoned", // Abandoned (bouton) ou Expired (sortie sans terminer)
        };

        return new GetTodaySessionResponse(state, row.TracksCount, row.AnswerCount, row.CurrentStreak);
    }

    // 1 seul aller-retour BDD : le défi du jour + (si un joueur est résolu) le statut de
    // sa session et son nombre de réponses, via sous-requêtes corrélées repliées en un
    // seul SQL par EF.
    private async Task<Row?> QueryAsync(DateOnly today, Guid? playerId, CancellationToken ct)
    {
        if (playerId is null)
        {
            var c = await db.DailyChallenges
                .AsNoTracking()
                .Where(x => x.Date == today)
                .Select(x => new { TracksCount = x.Tracks.Count })
                .FirstOrDefaultAsync(ct);

            return c is null ? null : new Row(c.TracksCount, null, 0, 0);
        }

        var pid = playerId.Value;
        var row = await db.DailyChallenges
            .AsNoTracking()
            .Where(x => x.Date == today)
            .Select(x => new
            {
                TracksCount = x.Tracks.Count,
                Session = x.GameSessions
                    .Where(s => s.PlayerId == pid)
                    .Select(s => new { s.Status, AnswerCount = s.Answers.Count })
                    .FirstOrDefault(),
                // Sous-requête scalaire non corrélée au défi → repliée dans le même SQL par EF.
                Streak = db.Players.Where(p => p.Id == pid).Select(p => p.CurrentStreak).FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        return row is null
            ? null
            : new Row(row.TracksCount, row.Session?.Status, row.Session?.AnswerCount ?? 0, row.Streak);
    }

    // Mirroir de StartSessionHandler.TryLazyGenerateAsync : sélection déterministe
    // (seed = today.DayNumber → même défi que le scheduler), race avec un concurrent
    // absorbée par la contrainte unique sur Date.
    private async Task<Row?> TryLazyGenerateAsync(DateOnly today, Guid? playerId, CancellationToken ct)
    {
        try
        {
            logger.LogWarning("Aucun défi pour le {Date} au moment du peek — génération paresseuse.", today);
            var result = await challengeGenerator.GenerateAsync(ct);
            if (result == GenerateResult.PoolInsufficient)
                return null;
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            db.ChangeTracker.Clear();
            logger.LogError(ex, "Échec de la génération paresseuse du défi du {Date} (peek).", today);
        }

        return await QueryAsync(today, playerId, ct);
    }

    private sealed record Row(int TracksCount, SessionStatus? SessionStatus, int AnswerCount, int CurrentStreak);
}
