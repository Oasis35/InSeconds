using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Retire <c>infra.import_state</c> : créée hors migrations (date d'ouverture de l'application), elle n'est plus lue
    /// ni par le code ni par les scripts du VPS. <c>IF EXISTS</c> : une base créée par les seules migrations ne l'a jamais eue.
    /// </summary>
    public partial class DropImportState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TABLE IF EXISTS infra.import_state;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rien à recréer : la table n'a jamais appartenu au modèle.
        }
    }
}
