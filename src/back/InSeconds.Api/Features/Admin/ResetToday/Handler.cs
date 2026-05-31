using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.ResetToday;

public sealed class ResetTodayHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(ResetTodayCommand command, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var challenge = await db.DailyChallenges
            .FirstOrDefaultAsync(c => c.Date == today, cancellationToken);

        if (challenge is null)
            return Results.NotFound(new { error = "no_challenge", message = "Aucun défi trouvé pour aujourd'hui." });

        var sessions = await db.GameSessions
            .Where(s => s.DailyChallengeId == challenge.Id)
            .ToListAsync(cancellationToken);

        db.GameSessions.RemoveRange(sessions);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new { deleted = sessions.Count, date = today.ToString("yyyy-MM-dd") });
    }
}
