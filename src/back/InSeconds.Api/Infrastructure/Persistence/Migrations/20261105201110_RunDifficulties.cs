using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RunDifficulties : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "challenge_reserve_tracks",
                schema: "runs",
                columns: table => new
                {
                    challenge_id = table.Column<int>(type: "integer", nullable: false),
                    round = table.Column<short>(type: "smallint", nullable: false),
                    rank = table.Column<short>(type: "smallint", nullable: false),
                    track_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_challenge_reserve_tracks", x => new { x.challenge_id, x.round, x.rank });
                    table.ForeignKey(
                        name: "fk_challenge_reserve_tracks_challenges_challenge_id",
                        column: x => x.challenge_id,
                        principalSchema: "runs",
                        principalTable: "challenges",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_challenge_reserve_tracks_tracks_track_id",
                        column: x => x.track_id,
                        principalSchema: "catalogue",
                        principalTable: "tracks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "session_rounds",
                schema: "runs",
                columns: table => new
                {
                    session_id = table.Column<int>(type: "integer", nullable: false),
                    round = table.Column<short>(type: "smallint", nullable: false),
                    difficulty = table.Column<short>(type: "smallint", nullable: false),
                    chosen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_session_rounds", x => new { x.session_id, x.round });
                    table.CheckConstraint("ck_session_rounds_difficulty", "difficulty IN (1, 2, 3)");
                    table.ForeignKey(
                        name: "fk_session_rounds_sessions_session_id",
                        column: x => x.session_id,
                        principalSchema: "runs",
                        principalTable: "sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_challenge_reserve_tracks_challenge_id_track_id",
                schema: "runs",
                table: "challenge_reserve_tracks",
                columns: new[] { "challenge_id", "track_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_challenge_reserve_tracks_track_id",
                schema: "runs",
                table: "challenge_reserve_tracks",
                column: "track_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "challenge_reserve_tracks",
                schema: "runs");

            migrationBuilder.DropTable(
                name: "session_rounds",
                schema: "runs");
        }
    }
}
