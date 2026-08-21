using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PurgeUnplayedPlayers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Purge ponctuelle : supprime les Players créés avant le passage à la création
            // paresseuse (cf. StartSession/GetCurrentPlayer) qui n'ont jamais démarré la
            // moindre partie. Un Player sans GameSession n'a aucune valeur (pas de streak,
            // pas de stats) — le garder ne fait que polluer la table.
            migrationBuilder.Sql(
                """
                DELETE FROM "Players"
                WHERE "Id" NOT IN (SELECT DISTINCT "PlayerId" FROM "GameSessions");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Irréversible : les Players purgés (jamais joué) n'ont laissé aucune trace
            // permettant de les reconstruire.
        }
    }
}
