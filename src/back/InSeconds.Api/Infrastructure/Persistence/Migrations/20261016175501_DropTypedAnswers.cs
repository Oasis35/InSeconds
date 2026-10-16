using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DropTypedAnswers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Minimisation RGPD : le texte tapé par les joueurs n'était relu par rien. Vidé avant la suppression des colonnes :
            // un DROP COLUMN laisse les valeurs dans les lignes sur disque jusqu'à leur réécriture, l'UPDATE en écrit des versions
            // sans texte (les anciennes partent au vacuum).
            migrationBuilder.Sql("UPDATE daily.answers SET artist_answer = NULL, title_answer = NULL WHERE artist_answer IS NOT NULL OR title_answer IS NOT NULL;");

            migrationBuilder.DropColumn(
                name: "artist_answer",
                schema: "daily",
                table: "answers");

            migrationBuilder.DropColumn(
                name: "title_answer",
                schema: "daily",
                table: "answers");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "artist_answer",
                schema: "daily",
                table: "answers",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "title_answer",
                schema: "daily",
                table: "answers",
                type: "text",
                nullable: true);
        }
    }
}
