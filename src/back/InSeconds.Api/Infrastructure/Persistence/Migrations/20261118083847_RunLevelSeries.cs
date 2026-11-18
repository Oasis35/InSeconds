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
            // dire. Le mode n'est pas encore public, ils repartent de zéro (remise à zéro acceptée, les testeurs ne sont pas prévenus).
            migrationBuilder.Sql("DELETE FROM runs.player_levels;");
            // Les réglages de l'ancien niveau (fenêtre, parties provisoires, échelle qui commençait à 0) : une échelle sur mesure en base serait
            // refusée par le contrôle du démarrage (le premier disque doit dépasser 0), et l'API ne démarrerait plus.
            migrationBuilder.Sql("DELETE FROM infra.settings WHERE key LIKE 'Runs:Levels:%';");

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
