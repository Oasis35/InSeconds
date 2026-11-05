using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RunCards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<short>(
                name: "offers_closed_through",
                schema: "runs",
                table: "sessions",
                type: "smallint",
                nullable: false,
                defaultValue: (short)0);

            migrationBuilder.CreateTable(
                name: "session_cards",
                schema: "runs",
                columns: table => new
                {
                    session_id = table.Column<int>(type: "integer", nullable: false),
                    slot = table.Column<short>(type: "smallint", nullable: false),
                    card = table.Column<short>(type: "smallint", nullable: false),
                    acquired_round = table.Column<short>(type: "smallint", nullable: false),
                    acquired_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    dropped_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    played_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    played_position = table.Column<short>(type: "smallint", nullable: true),
                    played_round = table.Column<short>(type: "smallint", nullable: true),
                    replacement_track_id = table.Column<int>(type: "integer", nullable: true),
                    play_order = table.Column<short>(type: "smallint", nullable: true),
                    decoy_track_ids = table.Column<int[]>(type: "integer[]", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_session_cards", x => new { x.session_id, x.slot });
                    table.CheckConstraint("ck_session_cards_card", "card BETWEEN 1 AND 8");
                    table.ForeignKey(
                        name: "fk_session_cards_sessions_session_id",
                        column: x => x.session_id,
                        principalSchema: "runs",
                        principalTable: "sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_session_cards_tracks_replacement_track_id",
                        column: x => x.replacement_track_id,
                        principalSchema: "catalogue",
                        principalTable: "tracks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_session_cards_replacement_track_id",
                schema: "runs",
                table: "session_cards",
                column: "replacement_track_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "session_cards",
                schema: "runs");

            migrationBuilder.DropColumn(
                name: "offers_closed_through",
                schema: "runs",
                table: "sessions");
        }
    }
}
