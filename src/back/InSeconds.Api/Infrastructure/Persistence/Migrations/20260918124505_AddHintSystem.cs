using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddHintSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ReleaseYear",
                table: "Tracks",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CurrentTrackHintLevelUsed",
                table: "GameSessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "HintLevelUsed",
                table: "GameSessionAnswers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.InsertData(
                table: "Settings",
                columns: new[] { "Id", "Description", "Key", "UpdatedAt", "Value" },
                values: new object[,]
                {
                    { 8, "Paliers d'écoute (secondes) débloquant respectivement l'indice niveau 1 et niveau 2.", "HintUnlockDurationsSeconds", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "5,10" },
                    { 9, "Pénalité de score (%) appliquée selon le niveau d'indice révélé (format niveau:pourcentage, séparés par virgule).", "HintPenaltyPercent", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "1:30,2:60" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 8);

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 9);

            migrationBuilder.DropColumn(
                name: "ReleaseYear",
                table: "Tracks");

            migrationBuilder.DropColumn(
                name: "CurrentTrackHintLevelUsed",
                table: "GameSessions");

            migrationBuilder.DropColumn(
                name: "HintLevelUsed",
                table: "GameSessionAnswers");
        }
    }
}
