using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Features.Admin.AllowedEmails.GetAllowedEmails;

public sealed class GetAllowedEmailsHandler(ApplicationDbContext db)
{
    public async Task<IResult> Handle(CancellationToken cancellationToken)
    {
        var emails = await db.AllowedEmails
            .AsNoTracking()
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new AllowedEmailDto(
                a.Id,
                a.Email,
                a.CreatedAt,
                db.Players.Any(p => p.Email == a.Email)))
            .ToListAsync(cancellationToken);

        return Results.Ok(new GetAllowedEmailsResponse(emails));
    }
}
