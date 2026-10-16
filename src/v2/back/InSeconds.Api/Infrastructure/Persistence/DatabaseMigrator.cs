using Microsoft.EntityFrameworkCore;

namespace InSeconds.Api.Infrastructure.Persistence;

public static class DatabaseMigrator
{
    public static async Task MigrateAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<InSecondsDbContext>();
        await db.Database.MigrateAsync(cancellationToken);
    }
}
