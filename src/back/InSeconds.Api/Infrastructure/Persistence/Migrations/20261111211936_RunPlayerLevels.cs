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
