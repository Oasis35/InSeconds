using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SasCandidats : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateSequence(
                name: "candidates_hilo",
                schema: "catalogue",
                incrementBy: 10);

            migrationBuilder.CreateTable(
                name: "candidates",
                schema: "catalogue",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    deezer_track_id = table.Column<long>(type: "bigint", nullable: false),
                    priority = table.Column<string>(type: "character varying(1)", maxLength: 1, nullable: true),
                    status = table.Column<short>(type: "smallint", nullable: false),
                    artist = table.Column<string>(type: "text", nullable: true),
                    title = table.Column<string>(type: "text", nullable: true),
                    cover_hash = table.Column<string>(type: "text", nullable: true),
                    release_year = table.Column<short>(type: "smallint", nullable: true),
                    rank = table.Column<int>(type: "integer", nullable: true),
                    preview_status = table.Column<short>(type: "smallint", nullable: false),
                    album_id = table.Column<long>(type: "bigint", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    read_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    dismissed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    add_requested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_candidates", x => x.id);
                    table.CheckConstraint("ck_candidates_preview_status", "preview_status IN (0, 1, 2)");
                    table.CheckConstraint("ck_candidates_priority", "priority IS NULL OR priority IN ('A', 'B', 'C')");
                    table.CheckConstraint("ck_candidates_status", "status IN (0, 1, 2)");
                });

            migrationBuilder.CreateIndex(
                name: "ix_candidates_deezer_track_id",
                schema: "catalogue",
                table: "candidates",
                column: "deezer_track_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "candidates",
                schema: "catalogue");

            migrationBuilder.DropSequence(
                name: "candidates_hilo",
                schema: "catalogue");
        }
    }
}
