using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Le cooldown des morceaux se déduit de la taille du pool (#275) : le réglage en jours <c>Daily:TrackCooldownDays</c> n'est plus lu, sa
    /// ligne (40 en prod) est retirée. La part du pool (<c>Daily:TrackCooldownPoolPercent</c>) a sa valeur par défaut sans ligne en base.
    /// </summary>
    public partial class TrackCooldownPoolPercent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DELETE FROM infra.settings WHERE key = 'Daily:TrackCooldownDays';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rien à remettre : sans ligne, l'ancien réglage retombait sur sa valeur par défaut.
        }
    }
}
