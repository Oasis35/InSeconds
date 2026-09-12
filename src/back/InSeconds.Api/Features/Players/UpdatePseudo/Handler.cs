using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InSeconds.Api.Features.Players.UpdatePseudo;

public sealed class UpdatePseudoHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(UpdatePseudoCommand command, CancellationToken cancellationToken)
    {
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == command.PlayerId, cancellationToken);

        if (player is null)
            return Results.NotFound();

        if (player.IsGuest)
            return Results.StatusCode(403);

        player.Pseudo = command.Pseudo;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            return Results.Conflict(new { error = "pseudo_taken", message = "Ce pseudo est déjà pris." });
        }

        return Results.Ok(new UpdatePseudoResponse(player.Pseudo));
    }
}
