using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RunCardsEarned : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "offers_closed_through",
                schema: "runs",
                table: "sessions");

            migrationBuilder.DropColumn(
                name: "decoy_track_ids",
                schema: "runs",
                table: "session_cards");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<short>(
                name: "offers_closed_through",
                schema: "runs",
                table: "sessions",
                type: "smallint",
                nullable: false,
                defaultValue: (short)0);

            migrationBuilder.AddColumn<int[]>(
                name: "decoy_track_ids",
                schema: "runs",
                table: "session_cards",
                type: "integer[]",
                nullable: true);
        }
    }
}
