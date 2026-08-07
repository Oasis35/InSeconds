using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTrackCooldownAndUsageTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "LastUsedDate",
                table: "Tracks",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "UsageCount",
                table: "Tracks",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.InsertData(
                table: "Settings",
                columns: new[] { "Id", "Description", "Key", "UpdatedAt", "Value" },
                values: new object[] { 7, "Nombre de jours avant qu'un morceau déjà utilisé redevienne éligible à la génération.", "TrackCooldownDays", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "30" });

            // Backfill LastUsedDate/UsageCount depuis l'historique DailyChallengeTrack/DailyChallenge existant.
            // Les morceaux jamais utilisés ne sont pas touchés (LastUsedDate reste NULL, UsageCount reste 0).
            migrationBuilder.Sql("""
                UPDATE "Tracks" t
                SET "LastUsedDate" = agg."MaxDate",
                    "UsageCount"   = agg."UsageCount"
                FROM (
                    SELECT dct."TrackId" AS "TrackId",
                           MAX(dc."Date") AS "MaxDate",
                           COUNT(*)       AS "UsageCount"
                    FROM "DailyChallengeTracks" dct
                    JOIN "DailyChallenges" dc ON dc."Id" = dct."DailyChallengeId"
                    GROUP BY dct."TrackId"
                ) agg
                WHERE t."Id" = agg."TrackId";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 7);

            migrationBuilder.DropColumn(
                name: "LastUsedDate",
                table: "Tracks");

            migrationBuilder.DropColumn(
                name: "UsageCount",
                table: "Tracks");
        }
    }
}
