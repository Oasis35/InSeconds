using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SerieRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // La Série change toutes les règles (vies, paliers, manches tirées à la volée) : les anciennes playlists, parties, records et niveaux
            // (calculés sur l'ancien barème) ne se rejouent ni ne se comparent. Le mode est sur invitation, en phase de test : on repart de zéro.
            migrationBuilder.Sql("DELETE FROM runs.received_challenges;");
            migrationBuilder.Sql("DELETE FROM runs.records;");
            migrationBuilder.Sql("DELETE FROM runs.player_levels;");
            migrationBuilder.Sql("DELETE FROM runs.sessions;");
            migrationBuilder.Sql("DELETE FROM runs.challenges;");

            migrationBuilder.DropTable(
                name: "challenge_reserve_tracks",
                schema: "runs");

            migrationBuilder.DropTable(
                name: "session_cards",
                schema: "runs");

            migrationBuilder.DropTable(
                name: "session_rounds",
                schema: "runs");

            migrationBuilder.DropCheckConstraint(
                name: "ck_sessions_status",
                schema: "runs",
                table: "sessions");

            migrationBuilder.DropColumn(
                name: "multiplier",
                schema: "runs",
                table: "challenge_tracks");

            migrationBuilder.AddCheckConstraint(
                name: "ck_sessions_status",
                schema: "runs",
                table: "sessions",
                sql: "status IN (0, 2, 3)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_sessions_status",
                schema: "runs",
                table: "sessions");

            migrationBuilder.AddColumn<decimal>(
                name: "multiplier",
                schema: "runs",
                table: "challenge_tracks",
                type: "numeric(3,2)",
                precision: 3,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

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
                name: "session_cards",
                schema: "runs",
                columns: table => new
                {
                    session_id = table.Column<int>(type: "integer", nullable: false),
                    slot = table.Column<short>(type: "smallint", nullable: false),
                    acquired_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    acquired_round = table.Column<short>(type: "smallint", nullable: false),
                    card = table.Column<short>(type: "smallint", nullable: false),
                    dropped_after_round = table.Column<short>(type: "smallint", nullable: true),
                    dropped_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    play_order = table.Column<short>(type: "smallint", nullable: true),
                    played_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    played_position = table.Column<short>(type: "smallint", nullable: true),
                    played_round = table.Column<short>(type: "smallint", nullable: true),
                    replacement_track_id = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_session_cards", x => new { x.session_id, x.slot });
                    table.CheckConstraint("ck_session_cards_card", "card BETWEEN 1 AND 10");
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

            migrationBuilder.CreateTable(
                name: "session_rounds",
                schema: "runs",
                columns: table => new
                {
                    session_id = table.Column<int>(type: "integer", nullable: false),
                    round = table.Column<short>(type: "smallint", nullable: false),
                    chosen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    difficulty = table.Column<short>(type: "smallint", nullable: false)
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

            migrationBuilder.AddCheckConstraint(
                name: "ck_sessions_status",
                schema: "runs",
                table: "sessions",
                sql: "status IN (0, 1, 2, 3)");

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

            migrationBuilder.CreateIndex(
                name: "ix_session_cards_replacement_track_id",
                schema: "runs",
                table: "session_cards",
                column: "replacement_track_id");
        }
    }
}
