using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Players_LastSeenAt",
                table: "Players",
                column: "LastSeenAt",
                filter: "\"LastSeenAt\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_GameSessions_PlayerStatusChallenge",
                table: "GameSessions",
                columns: new[] { "PlayerId", "Status", "DailyChallengeId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Players_LastSeenAt",
                table: "Players");

            migrationBuilder.DropIndex(
                name: "IX_GameSessions_PlayerStatusChallenge",
                table: "GameSessions");
        }
    }
}
