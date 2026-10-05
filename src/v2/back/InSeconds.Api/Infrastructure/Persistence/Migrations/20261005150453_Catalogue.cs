using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Catalogue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "catalogue");

            migrationBuilder.CreateSequence(
                name: "tracks_hilo",
                schema: "catalogue",
                incrementBy: 10);

            migrationBuilder.CreateTable(
                name: "tracks",
                schema: "catalogue",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    deezer_track_id = table.Column<long>(type: "bigint", nullable: false),
                    artist = table.Column<string>(type: "text", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    cover_hash = table.Column<string>(type: "text", nullable: true),
                    release_year = table.Column<short>(type: "smallint", nullable: true),
                    deezer_rank = table.Column<int>(type: "integer", nullable: true),
                    rank_updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    preview_status = table.Column<short>(type: "smallint", nullable: false),
                    preview_checked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    disabled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_tracks", x => x.id);
                    table.CheckConstraint("ck_tracks_preview_status", "preview_status IN (0, 1, 2)");
                });

            migrationBuilder.CreateIndex(
                name: "ix_tracks_deezer_track_id",
                schema: "catalogue",
                table: "tracks",
                column: "deezer_track_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tracks",
                schema: "catalogue");

            migrationBuilder.DropSequence(
                name: "tracks_hilo",
                schema: "catalogue");
        }
    }
}
