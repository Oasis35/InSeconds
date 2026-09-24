using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPlayerHasReachedMaxFreezes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HasReachedMaxFreezes",
                table: "Players",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Backfill : les comptes déjà au plafond actuel (StreakFreezeMax=2 par défaut) ont
            // forcément déjà atteint ce plafond dans le passé — évite un « +1 gel gagné ! »
            // superflu la prochaine fois qu'ils regagneraient un gel après en avoir consommé un.
            migrationBuilder.Sql("UPDATE \"Players\" SET \"HasReachedMaxFreezes\" = true WHERE \"StreakFreezes\" >= 2;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HasReachedMaxFreezes",
                table: "Players");
        }
    }
}
