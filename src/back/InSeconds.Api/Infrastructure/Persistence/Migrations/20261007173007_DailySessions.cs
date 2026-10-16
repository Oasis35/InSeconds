using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DailySessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateSequence(
                name: "sessions_hilo",
                schema: "daily",
                incrementBy: 10);

            migrationBuilder.CreateTable(
                name: "sessions",
                schema: "daily",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    challenge_id = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<short>(type: "smallint", nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ended_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    total_score = table.Column<int>(type: "integer", nullable: false),
                    total_listened_seconds = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: false),
                    current_position = table.Column<short>(type: "smallint", nullable: true),
                    current_listened_seconds = table.Column<decimal>(type: "numeric(4,2)", precision: 4, scale: 2, nullable: true),
                    current_hint_level = table.Column<short>(type: "smallint", nullable: false, defaultValue: (short)0),
                    freezes_used = table.Column<short>(type: "smallint", nullable: false, defaultValue: (short)0),
                    freeze_earned = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sessions", x => x.id);
                    table.CheckConstraint("ck_sessions_status", "status IN (0, 1, 2, 3)");
                    table.ForeignKey(
                        name: "fk_sessions_challenges_challenge_id",
                        column: x => x.challenge_id,
                        principalSchema: "daily",
                        principalTable: "challenges",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_sessions_players_player_id",
                        column: x => x.player_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "streaks",
                schema: "daily",
                columns: table => new
                {
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    current_streak = table.Column<int>(type: "integer", nullable: false),
                    last_played_date = table.Column<DateOnly>(type: "date", nullable: true),
                    freezes = table.Column<short>(type: "smallint", nullable: false, defaultValue: (short)0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_streaks", x => x.player_id);
                    table.ForeignKey(
                        name: "fk_streaks_players_player_id",
                        column: x => x.player_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "answers",
                schema: "daily",
                columns: table => new
                {
                    session_id = table.Column<int>(type: "integer", nullable: false),
                    position = table.Column<short>(type: "smallint", nullable: false),
                    listened_seconds = table.Column<decimal>(type: "numeric(4,2)", precision: 4, scale: 2, nullable: false),
                    was_extended = table.Column<bool>(type: "boolean", nullable: false),
                    hint_level = table.Column<short>(type: "smallint", nullable: false),
                    artist_answer = table.Column<string>(type: "text", nullable: true),
                    title_answer = table.Column<string>(type: "text", nullable: true),
                    artist_correct = table.Column<bool>(type: "boolean", nullable: false),
                    title_correct = table.Column<bool>(type: "boolean", nullable: false),
                    score = table.Column<int>(type: "integer", nullable: false),
                    answered_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_answers", x => new { x.session_id, x.position });
                    table.ForeignKey(
                        name: "fk_answers_sessions_session_id",
                        column: x => x.session_id,
                        principalSchema: "daily",
                        principalTable: "sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_sessions_challenge_id_status",
                schema: "daily",
                table: "sessions",
                columns: new[] { "challenge_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_sessions_player_challenge",
                schema: "daily",
                table: "sessions",
                columns: new[] { "player_id", "challenge_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "answers",
                schema: "daily");

            migrationBuilder.DropTable(
                name: "streaks",
                schema: "daily");

            migrationBuilder.DropTable(
                name: "sessions",
                schema: "daily");

            migrationBuilder.DropSequence(
                name: "sessions_hilo",
                schema: "daily");
        }
    }
}
