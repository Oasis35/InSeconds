using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPlayerIsAdmin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsAdmin",
                table: "Players",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Bootstrap du tout premier admin : ne fait rien si ce Player n'existe pas encore
            // (il faut s'être connecté au moins une fois via magic link avant ce déploiement) —
            // dans ce cas, passer par la commande SQL manuelle documentée dans CLAUDE.md.
            migrationBuilder.Sql(
                "UPDATE \"Players\" SET \"IsAdmin\" = true WHERE \"Email\" = 'clement.rageau@gmail.com';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsAdmin",
                table: "Players");
        }
    }
}
