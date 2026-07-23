using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveMaxExtensionsPerAnswerSetting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Settings",
                keyColumn: "Id",
                keyValue: 3);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Settings",
                columns: new[] { "Id", "Description", "Key", "UpdatedAt", "Value" },
                values: new object[] { 3, "Nombre maximal de prolongations autorisées par réponse.", "MaxExtensionsPerAnswer", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "1" });
        }
    }
}
