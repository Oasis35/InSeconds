using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DailyBestStreak : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "best_streak",
                schema: "daily",
                table: "streaks",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Les séries existantes : la plus longue suite de jours de défi terminés (îlots de dates consécutives), jamais moins que la série en
            // cours (qui compte aussi les jours couverts par un gel, invisibles après coup).
            migrationBuilder.Sql(
                """
                UPDATE daily.streaks s
                SET best_streak = GREATEST(s.current_streak, r.longest)
                FROM (
                    SELECT player_id, MAX(n) AS longest
                    FROM (
                        SELECT player_id, COUNT(*) AS n
                        FROM (
                            SELECT ss.player_id, c.date - (ROW_NUMBER() OVER (PARTITION BY ss.player_id ORDER BY c.date))::int AS island
                            FROM daily.sessions ss
                            JOIN daily.challenges c ON c.id = ss.challenge_id
                            WHERE ss.status = 1
                        ) days
                        GROUP BY player_id, island
                    ) islands
                    GROUP BY player_id
                ) r
                WHERE r.player_id = s.player_id;

                UPDATE daily.streaks SET best_streak = current_streak WHERE best_streak < current_streak;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "best_streak",
                schema: "daily",
                table: "streaks");
        }
    }
}
