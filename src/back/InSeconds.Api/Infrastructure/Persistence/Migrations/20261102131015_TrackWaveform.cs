using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TrackWaveform : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte[]>(
                name: "waveform",
                schema: "catalogue",
                table: "tracks",
                type: "bytea",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "waveform_computed_at",
                schema: "catalogue",
                table: "tracks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "waveform_source",
                schema: "catalogue",
                table: "tracks",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "waveform",
                schema: "catalogue",
                table: "tracks");

            migrationBuilder.DropColumn(
                name: "waveform_computed_at",
                schema: "catalogue",
                table: "tracks");

            migrationBuilder.DropColumn(
                name: "waveform_source",
                schema: "catalogue",
                table: "tracks");
        }
    }
}
