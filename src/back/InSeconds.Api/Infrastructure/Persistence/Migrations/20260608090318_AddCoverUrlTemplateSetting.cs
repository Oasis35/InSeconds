using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCoverUrlTemplateSetting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Settings",
                columns: ["Key", "Value", "Description", "UpdatedAt"],
                values: new object[]
                {
                    "CoverUrlTemplate",
                    "https://cdn-images.dzcdn.net/images/cover/{hash}/250x250-000000-80-0-0.jpg",
                    "Modèle d'URL pour les pochettes Deezer. {hash} est remplacé par le hash stocké en base.",
                    new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Key",
                keyValue: "CoverUrlTemplate");
        }
    }
}
