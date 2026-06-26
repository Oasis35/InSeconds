using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionAntiCheat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CurrentTrackId",
                table: "GameSessions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CurrentTrackMinListenedSeconds",
                table: "GameSessions",
                type: "numeric",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CurrentTrackId",
                table: "GameSessions");

            migrationBuilder.DropColumn(
                name: "CurrentTrackMinListenedSeconds",
                table: "GameSessions");
        }
    }
}
