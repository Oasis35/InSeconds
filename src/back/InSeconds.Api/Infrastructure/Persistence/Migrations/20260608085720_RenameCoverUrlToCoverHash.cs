using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RenameCoverUrlToCoverHash : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "CoverUrl",
                table: "Tracks",
                newName: "CoverHash");

            migrationBuilder.AlterColumn<string>(
                name: "CoverHash",
                table: "Tracks",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(500)",
                oldMaxLength: 500,
                oldNullable: true);

            // Extrait le hash depuis l'URL existante "…/images/cover/{hash}/250x250-…"
            migrationBuilder.Sql(@"
                UPDATE ""Tracks""
                SET ""CoverHash"" = split_part(split_part(""CoverHash"", '/images/cover/', 2), '/', 1)
                WHERE ""CoverHash"" LIKE '%/images/cover/%';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "CoverHash",
                table: "Tracks",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64,
                oldNullable: true);

            migrationBuilder.RenameColumn(
                name: "CoverHash",
                table: "Tracks",
                newName: "CoverUrl");
        }
    }
}
