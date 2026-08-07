using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.Settings.UpdateTrackCooldown;

public sealed class UpdateTrackCooldownHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(UpdateTrackCooldownCommand command, CancellationToken ct)
    {
        var updated = await db.Settings
            .Where(s => s.Key == "TrackCooldownDays")
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Value, command.TrackCooldownDays.ToString())
                .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), ct);

        if (updated == 0)
            return Results.NotFound(new { error = "setting_not_found" });

        return Results.Ok(new UpdateTrackCooldownResponse(command.TrackCooldownDays));
    }
}
