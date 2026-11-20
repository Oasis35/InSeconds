using InSeconds.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace InSeconds.IntegrationTests.Daily;

/// <summary>
/// La migration <c>DailyBestStreak</c> calcule la meilleure série des séries existantes : la plus longue suite de jours de défi terminés (îlots
/// de dates consécutives), jamais moins que la série en cours (qui compte aussi les jours couverts par un gel). Joué sur une base migrée jusqu'à
/// la migration d'avant, remplie, puis migrée jusqu'au bout.
/// </summary>
public class DailyBestStreakMigrationTests(PostgresFixture postgres)
{
    private const string MigrationBefore = "20261119202655_AdminRunAccess";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task LeRattrapage_PrendLaPlusLongueSuiteDeJoursTermines_JamaisSousLaSerieEnCours()
    {
        var connectionString = await postgres.CreateEmptyDatabaseAsync();
        var options = DatabaseServiceCollectionExtensions.Configure(new DbContextOptionsBuilder<InSecondsDbContext>(), connectionString);
        await using var db = new InSecondsDbContext((DbContextOptions<InSecondsDbContext>)options.Options);
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync(MigrationBefore, Ct);

        var (alice, bob, carol) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        await ExecuteAsync(connectionString, $"""
            INSERT INTO players.players (id, created_at) VALUES ('{alice}', now()), ('{bob}', now()), ('{carol}', now());
            INSERT INTO daily.challenges (id, date, seed, origin) VALUES
                (1, '2026-11-01', 1, 1), (2, '2026-11-02', 2, 1), (3, '2026-11-03', 3, 1), (4, '2026-11-05', 4, 1), (5, '2026-11-06', 5, 1), (6, '2026-11-07', 6, 1);
            -- Alice : trois jours de suite (1, 2, 3), puis le 5 et le 6 ; le 7 abandonné ne compte pas. Série en cours : 2.
            INSERT INTO daily.sessions (id, player_id, challenge_id, status, started_at, total_score, total_listened_seconds) VALUES
                (101, '{alice}', 1, 1, now(), 1000, 5), (102, '{alice}', 2, 1, now(), 1000, 5), (103, '{alice}', 3, 1, now(), 1000, 5),
                (104, '{alice}', 4, 1, now(), 1000, 5), (105, '{alice}', 5, 1, now(), 1000, 5), (106, '{alice}', 6, 2, now(), 100, 1),
            -- Bob : deux jours terminés, mais une série en cours de 10 (des gels ont couvert ses absences).
                (201, '{bob}', 5, 1, now(), 1000, 5), (202, '{bob}', 6, 1, now(), 1000, 5);
            INSERT INTO daily.streaks (player_id, current_streak, last_played_date, freezes) VALUES
                ('{alice}', 2, '2026-11-06', 0), ('{bob}', 10, '2026-11-07', 0), ('{carol}', 0, NULL, 1);
            """);

        await migrator.MigrateAsync(cancellationToken: Ct);

        Assert.Equal(3, await BestStreakAsync(connectionString, alice));
        Assert.Equal(10, await BestStreakAsync(connectionString, bob));
        // Aucune partie, aucune série : 0.
        Assert.Equal(0, await BestStreakAsync(connectionString, carol));
    }

    private static async Task ExecuteAsync(string connectionString, string sql)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(Ct);
    }

    private static async Task<int> BestStreakAsync(string connectionString, Guid playerId)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand($"SELECT best_streak FROM daily.streaks WHERE player_id = '{playerId}'", connection);
        return (int)(await command.ExecuteScalarAsync(Ct))!;
    }
}
