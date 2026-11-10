using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TrackThemes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateSequence(
                name: "themes_hilo",
                schema: "catalogue",
                incrementBy: 10);

            migrationBuilder.CreateTable(
                name: "themes",
                schema: "catalogue",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "citext", maxLength: 60, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_themes", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "track_themes",
                schema: "catalogue",
                columns: table => new
                {
                    track_id = table.Column<int>(type: "integer", nullable: false),
                    theme_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_track_themes", x => new { x.track_id, x.theme_id });
                    table.ForeignKey(
                        name: "fk_track_themes_themes_theme_id",
                        column: x => x.theme_id,
                        principalSchema: "catalogue",
                        principalTable: "themes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_track_themes_tracks_track_id",
                        column: x => x.track_id,
                        principalSchema: "catalogue",
                        principalTable: "tracks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_themes_name",
                schema: "catalogue",
                table: "themes",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_track_themes_theme_id",
                schema: "catalogue",
                table: "track_themes",
                column: "theme_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "track_themes",
                schema: "catalogue");

            migrationBuilder.DropTable(
                name: "themes",
                schema: "catalogue");

            migrationBuilder.DropSequence(
                name: "themes_hilo",
                schema: "catalogue");
        }
    }
}
