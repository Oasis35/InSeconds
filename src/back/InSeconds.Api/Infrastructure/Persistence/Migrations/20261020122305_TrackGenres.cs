using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TrackGenres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "album_id",
                schema: "catalogue",
                table: "tracks",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "genres_checked_at",
                schema: "catalogue",
                table: "tracks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "genres",
                schema: "catalogue",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_genres", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "track_genres",
                schema: "catalogue",
                columns: table => new
                {
                    track_id = table.Column<int>(type: "integer", nullable: false),
                    genre_id = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_track_genres", x => new { x.track_id, x.genre_id });
                    table.ForeignKey(
                        name: "fk_track_genres_genres_genre_id",
                        column: x => x.genre_id,
                        principalSchema: "catalogue",
                        principalTable: "genres",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_track_genres_tracks_track_id",
                        column: x => x.track_id,
                        principalSchema: "catalogue",
                        principalTable: "tracks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_track_genres_genre_id",
                schema: "catalogue",
                table: "track_genres",
                column: "genre_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "track_genres",
                schema: "catalogue");

            migrationBuilder.DropTable(
                name: "genres",
                schema: "catalogue");

            migrationBuilder.DropColumn(
                name: "album_id",
                schema: "catalogue",
                table: "tracks");

            migrationBuilder.DropColumn(
                name: "genres_checked_at",
                schema: "catalogue",
                table: "tracks");
        }
    }
}
