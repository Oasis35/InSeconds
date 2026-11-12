using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RunPlayerLevels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "player_levels",
                schema: "runs",
                columns: table => new
                {
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    points = table.Column<int>(type: "integer", nullable: false),
                    runs_played = table.Column<int>(type: "integer", nullable: false),
                    recent_scores = table.Column<int[]>(type: "integer[]", nullable: false),
                    last_session_id = table.Column<int>(type: "integer", nullable: true),
                    last_delta = table.Column<int>(type: "integer", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_player_levels", x => x.player_id);
                    table.ForeignKey(
                        name: "fk_player_levels_players_player_id",
                        column: x => x.player_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            // Le niveau des joueurs qui ont déjà fini des parties (gagnées ou perdues) : la moyenne de leurs 10 dernières, comme RunLevelPolicy avec la
            // fenêtre par défaut, et leurs 50 derniers scores de la plus ancienne à la plus récente. Sans cela, ils n'auraient de niveau qu'à leur
            // prochaine partie.
            migrationBuilder.Sql(
                """
                WITH finished AS (
                    SELECT player_id, GREATEST(total_score, 0) AS score,
                           row_number() OVER (PARTITION BY player_id ORDER BY ended_at DESC, id DESC) AS rn,
                           count(*) OVER (PARTITION BY player_id) AS played
                    FROM runs.sessions
                    WHERE status IN (1, 2) AND ended_at IS NOT NULL
                )
                INSERT INTO runs.player_levels (player_id, points, runs_played, recent_scores, last_session_id, last_delta, updated_at)
                SELECT player_id,
                       round(avg(score) FILTER (WHERE rn <= 10))::int,
                       max(played)::int,
                       array_agg(score ORDER BY rn DESC) FILTER (WHERE rn <= 50),
                       NULL, 0, now()
                FROM finished
                GROUP BY player_id;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "player_levels",
                schema: "runs");
        }
    }
}
