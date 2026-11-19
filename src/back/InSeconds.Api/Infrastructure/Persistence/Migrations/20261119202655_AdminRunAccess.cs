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
            // L'ancien code donne l'accès d'office aux admins et ne les retire du classement général que parce qu'ils n'ont pas de ligne :
            // on retire celle des admins (rien n'est perdu pour eux). Un retour de l'image sans ce Down demande ce SQL à la main.
            migrationBuilder.Sql("""
                DELETE FROM runs.access a USING players.accounts c
                 WHERE c.player_id = a.player_id AND c.is_admin;
                """);
        }
    }
}
