using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AdminRunAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Le rôle admin ne donne plus l'accès Survie d'office : les admins d'aujourd'hui reçoivent leur ligne pour ne rien perdre au
            // déploiement, et peuvent ensuite se la retirer par l'interrupteur de l'onglet Joueurs.
            migrationBuilder.Sql("""
                INSERT INTO runs.access (player_id, granted_at)
                SELECT player_id, now() FROM players.accounts WHERE is_admin
                ON CONFLICT (player_id) DO NOTHING;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rien à défaire : l'ancien code donnait l'accès d'office aux admins, une ligne de plus ne change rien pour lui.
        }
    }
}
