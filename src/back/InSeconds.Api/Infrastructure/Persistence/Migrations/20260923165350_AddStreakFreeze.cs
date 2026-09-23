using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStreakFreeze : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "StreakFreezes",
                table: "Players",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "FreezeEarned",
                table: "GameSessions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "FreezesUsed",
                table: "GameSessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Gel offert à l'inscription : les comptes déjà liés avant cette migration le reçoivent
            // aussi (les nouveaux l'obtiennent via Player.LinkToAccount). Sans effet sur une BDD vide.
            migrationBuilder.Sql("UPDATE \"Players\" SET \"StreakFreezes\" = 1 WHERE \"IsGuest\" = false;");

            migrationBuilder.InsertData(
                table: "Settings",
                columns: new[] { "Id", "Description", "Key", "UpdatedAt", "Value" },
                values: new object[,]
                {
                    { 10, "Gel de série : +1 gel à chaque multiple de ce nombre de jours de série (comptes connectés).", "StreakFreezeEveryDays", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "7" },
                    { 11, "Gel de série : nombre maximum de gels en stock.", "StreakFreezeMax", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "2" },
                    { 12, "Série minimale (jours) perdue par un invité pour afficher l'incitation à créer un compte.", "StreakLostNudgeMinDays", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "2" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 10);

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 11);

            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 12);

            migrationBuilder.DropColumn(
                name: "StreakFreezes",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "FreezeEarned",
                table: "GameSessions");

            migrationBuilder.DropColumn(
                name: "FreezesUsed",
                table: "GameSessions");
        }
    }
}
