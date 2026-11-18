using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RunLevelSeries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Le niveau change de formule (80 % de l'ancien, 20 % du score, #607) : les niveaux de l'ancienne moyenne glissante ne veulent plus rien
            // dire. Le mode n'est pas encore public, ils repartent de zéro (les testeurs sont prévenus).
            migrationBuilder.Sql("DELETE FROM runs.player_levels;");

            migrationBuilder.DropColumn(
                name: "recent_scores",
                schema: "runs",
                table: "player_levels");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int[]>(
                name: "recent_scores",
                schema: "runs",
                table: "player_levels",
                type: "integer[]",
                nullable: false,
                defaultValue: new int[0]);
        }
    }
}
