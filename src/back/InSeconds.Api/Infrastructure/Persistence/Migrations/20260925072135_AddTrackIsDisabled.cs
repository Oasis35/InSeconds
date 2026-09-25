using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTrackIsDisabled : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsDisabled",
                table: "Tracks",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsDisabled",
                table: "Tracks");
        }
    }
}
