using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Migration vide, voulue : elle enregistre dans le modèle EF les tables de l'outbox de Wolverine
    /// (MapWolverineEnvelopeStorage), marquées ExcludeFromMigrations. Wolverine crée lui-même ses
    /// tables du schéma messaging au démarrage de l'API.
    /// </summary>
    public partial class MapWolverineEnvelopeStorage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
