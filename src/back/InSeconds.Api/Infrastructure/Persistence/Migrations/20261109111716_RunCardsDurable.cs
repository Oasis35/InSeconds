using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RunCardsDurable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_session_cards_card",
                schema: "runs",
                table: "session_cards");

            migrationBuilder.AddColumn<short>(
                name: "dropped_after_round",
                schema: "runs",
                table: "session_cards",
                type: "smallint",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_cards_card",
                schema: "runs",
                table: "session_cards",
                sql: "card BETWEEN 1 AND 10");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_session_cards_card",
                schema: "runs",
                table: "session_cards");

            migrationBuilder.DropColumn(
                name: "dropped_after_round",
                schema: "runs",
                table: "session_cards");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_cards_card",
                schema: "runs",
                table: "session_cards",
                sql: "card BETWEEN 1 AND 8");
        }
    }
}
