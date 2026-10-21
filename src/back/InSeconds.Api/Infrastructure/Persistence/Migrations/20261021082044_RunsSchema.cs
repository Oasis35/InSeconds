using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RunsSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "runs");

            migrationBuilder.CreateSequence(
                name: "challenges_hilo",
                schema: "runs",
                incrementBy: 10);

            migrationBuilder.CreateSequence(
                name: "sessions_hilo",
                schema: "runs",
                incrementBy: 10);

            migrationBuilder.CreateTable(
                name: "access",
                schema: "runs",
                columns: table => new
                {
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    granted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_access", x => x.player_id);
                    table.ForeignKey(
                        name: "fk_access_players_player_id",
                        column: x => x.player_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "challenges",
                schema: "runs",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    code = table.Column<string>(type: "char(6)", nullable: false),
                    seed = table.Column<int>(type: "integer", nullable: false),
                    rules = table.Column<string>(type: "jsonb", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_challenges1", x => x.id);
                    table.ForeignKey(
                        name: "fk_challenges_players_created_by",
                        column: x => x.created_by,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "challenge_tracks",
                schema: "runs",
                columns: table => new
                {
                    challenge_id = table.Column<int>(type: "integer", nullable: false),
                    position = table.Column<short>(type: "smallint", nullable: false),
                    track_id = table.Column<int>(type: "integer", nullable: false),
                    round = table.Column<short>(type: "smallint", nullable: false),
                    multiplier = table.Column<decimal>(type: "numeric(3,2)", precision: 3, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_challenge_tracks1", x => new { x.challenge_id, x.position });
                    table.ForeignKey(
                        name: "fk_challenge_tracks_challenges_challenge_id",
                        column: x => x.challenge_id,
                        principalSchema: "runs",
                        principalTable: "challenges",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_challenge_tracks_tracks_track_id",
                        column: x => x.track_id,
                        principalSchema: "catalogue",
                        principalTable: "tracks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "sessions",
                schema: "runs",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    challenge_id = table.Column<int>(type: "integer", nullable: false),
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<short>(type: "smallint", nullable: false),
                    current_position = table.Column<short>(type: "smallint", nullable: true),
                    current_listened_seconds = table.Column<decimal>(type: "numeric(4,2)", precision: 4, scale: 2, nullable: true),
                    rounds_passed = table.Column<short>(type: "smallint", nullable: false),
                    total_score = table.Column<int>(type: "integer", nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ended_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sessions1", x => x.id);
                    table.CheckConstraint("ck_sessions_status", "status IN (0, 1, 2, 3)");
                    table.ForeignKey(
                        name: "fk_sessions_challenges_challenge_id",
                        column: x => x.challenge_id,
                        principalSchema: "runs",
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
                name: "answers",
                schema: "runs",
                columns: table => new
                {
                    session_id = table.Column<int>(type: "integer", nullable: false),
                    position = table.Column<short>(type: "smallint", nullable: false),
                    artist_correct = table.Column<bool>(type: "boolean", nullable: false),
                    title_correct = table.Column<bool>(type: "boolean", nullable: false),
                    points = table.Column<int>(type: "integer", nullable: false),
                    neutralized = table.Column<bool>(type: "boolean", nullable: false),
                    answered_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_answers1", x => new { x.session_id, x.position });
                    table.ForeignKey(
                        name: "fk_answers_sessions_session_id",
                        column: x => x.session_id,
                        principalSchema: "runs",
                        principalTable: "sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "records",
                schema: "runs",
                columns: table => new
                {
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    best_score = table.Column<int>(type: "integer", nullable: false),
                    best_rounds_passed = table.Column<short>(type: "smallint", nullable: false),
                    session_id = table.Column<int>(type: "integer", nullable: false),
                    achieved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_records", x => x.player_id);
                    table.ForeignKey(
                        name: "fk_records_players_player_id",
                        column: x => x.player_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_records_run_session_session_id",
                        column: x => x.session_id,
                        principalSchema: "runs",
                        principalTable: "sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_challenge_tracks_challenge_id_track_id1",
                schema: "runs",
                table: "challenge_tracks",
                columns: new[] { "challenge_id", "track_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_challenge_tracks_track_id1",
                schema: "runs",
                table: "challenge_tracks",
                column: "track_id");

            migrationBuilder.CreateIndex(
                name: "ix_challenges_code",
                schema: "runs",
                table: "challenges",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_challenges_created_by",
                schema: "runs",
                table: "challenges",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "ix_records_session_id",
                schema: "runs",
                table: "records",
                column: "session_id");

            migrationBuilder.CreateIndex(
                name: "ix_sessions_challenge_player",
                schema: "runs",
                table: "sessions",
                columns: new[] { "challenge_id", "player_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_sessions_player_id_status",
                schema: "runs",
                table: "sessions",
                columns: new[] { "player_id", "status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "access",
                schema: "runs");

            migrationBuilder.DropTable(
                name: "answers",
                schema: "runs");

            migrationBuilder.DropTable(
                name: "challenge_tracks",
                schema: "runs");

            migrationBuilder.DropTable(
                name: "records",
                schema: "runs");

            migrationBuilder.DropTable(
                name: "sessions",
                schema: "runs");

            migrationBuilder.DropTable(
                name: "challenges",
                schema: "runs");

            migrationBuilder.DropSequence(
                name: "challenges_hilo",
                schema: "runs");

            migrationBuilder.DropSequence(
                name: "sessions_hilo",
                schema: "runs");
        }
    }
}
