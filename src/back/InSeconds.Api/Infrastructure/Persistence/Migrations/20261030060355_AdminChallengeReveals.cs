using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AdminChallengeReveals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "challenge_reveals",
                schema: "daily",
                columns: table => new
                {
                    challenge_id = table.Column<int>(type: "integer", nullable: false),
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    revealed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_challenge_reveals", x => new { x.challenge_id, x.player_id });
                    table.ForeignKey(
                        name: "fk_challenge_reveals_daily_challenge_challenge_id",
                        column: x => x.challenge_id,
                        principalSchema: "daily",
                        principalTable: "challenges",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_challenge_reveals_players_player_id",
                        column: x => x.player_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_challenge_reveals_player_id",
                schema: "daily",
                table: "challenge_reveals",
                column: "player_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "challenge_reveals",
                schema: "daily");
        }
    }
}
