using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDurationScoresSetting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Settings",
                columns: new[] { "Id", "Description", "Key", "UpdatedAt", "Value" },
                values: new object[] { 5, "Score de base par palier d'écoute (format palier:score, séparés par virgule).", "DurationScores", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "1:1000,2:850,3:700,5:500,10:300,15:150,30:50" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 5);
        }
    }
}
