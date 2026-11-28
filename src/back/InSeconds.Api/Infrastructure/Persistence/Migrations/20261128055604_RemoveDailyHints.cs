using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveDailyHints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Les réglages des indices n'existent plus : une ligne laissée en base ne serait plus lue par personne.
            migrationBuilder.Sql("DELETE FROM infra.settings WHERE key LIKE 'Daily:Hint%';");

            migrationBuilder.DropColumn(
                name: "current_hint_level",
                schema: "daily",
                table: "sessions");

            migrationBuilder.DropColumn(
                name: "hint_level",
                schema: "daily",
                table: "answers");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<short>(
                name: "current_hint_level",
                schema: "daily",
                table: "sessions",
                type: "smallint",
                nullable: false,
                defaultValue: (short)0);

            migrationBuilder.AddColumn<short>(
                name: "hint_level",
                schema: "daily",
                table: "answers",
                type: "smallint",
                nullable: false,
                defaultValue: (short)0);
        }
    }
}
