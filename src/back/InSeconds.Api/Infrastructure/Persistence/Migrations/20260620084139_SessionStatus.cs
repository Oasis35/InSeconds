using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SessionStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "AbandonedAt",
                table: "GameSessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CompletedAt",
                table: "GameSessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "GameSessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_GameSessions_ChallengeStatus",
                table: "GameSessions",
                columns: new[] { "DailyChallengeId", "Status" });

            // Les sessions insérées par DevSeed (joueur dev aaaaaaaa-...) représentent des parties
            // terminées — les marquer Completed maintenant que la colonne existe.
            migrationBuilder.Sql("""
                UPDATE "GameSessions"
                SET "Status" = 1,
                    "CompletedAt" = "CreatedAt" + INTERVAL '5 minutes'
                WHERE "PlayerId" = 'aaaaaaaa-0000-0000-0000-000000000001';
            """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_GameSessions_ChallengeStatus",
                table: "GameSessions");

            migrationBuilder.DropColumn(
                name: "AbandonedAt",
                table: "GameSessions");

            migrationBuilder.DropColumn(
                name: "CompletedAt",
                table: "GameSessions");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "GameSessions");
        }
    }
}
