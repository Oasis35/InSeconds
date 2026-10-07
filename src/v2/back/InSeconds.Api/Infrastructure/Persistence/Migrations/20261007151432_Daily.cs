using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Daily : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "daily");

            migrationBuilder.CreateSequence(
                name: "challenges_hilo",
                schema: "daily",
                incrementBy: 10);

            migrationBuilder.CreateTable(
                name: "challenges",
                schema: "daily",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    date = table.Column<DateOnly>(type: "date", nullable: false),
                    seed = table.Column<int>(type: "integer", nullable: false),
                    origin = table.Column<short>(type: "smallint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_challenges", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "challenge_tracks",
                schema: "daily",
                columns: table => new
                {
                    challenge_id = table.Column<int>(type: "integer", nullable: false),
                    position = table.Column<short>(type: "smallint", nullable: false),
                    track_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_challenge_tracks", x => new { x.challenge_id, x.position });
                    table.ForeignKey(
                        name: "fk_challenge_tracks_challenges_challenge_id",
                        column: x => x.challenge_id,
                        principalSchema: "daily",
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

            migrationBuilder.CreateIndex(
                name: "ix_challenge_tracks_challenge_id_track_id",
                schema: "daily",
                table: "challenge_tracks",
                columns: new[] { "challenge_id", "track_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_challenge_tracks_track_id",
                schema: "daily",
                table: "challenge_tracks",
                column: "track_id");

            migrationBuilder.CreateIndex(
                name: "ix_challenges_date",
                schema: "daily",
                table: "challenges",
                column: "date",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "challenge_tracks",
                schema: "daily");

            migrationBuilder.DropTable(
                name: "challenges",
                schema: "daily");

            migrationBuilder.DropSequence(
                name: "challenges_hilo",
                schema: "daily");
        }
    }
}
