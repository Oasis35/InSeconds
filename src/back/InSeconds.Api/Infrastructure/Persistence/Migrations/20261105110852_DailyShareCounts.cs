using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DailyShareCounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "share_counts",
                schema: "daily",
                columns: table => new
                {
                    date = table.Column<DateOnly>(type: "date", nullable: false),
                    format = table.Column<short>(type: "smallint", nullable: false),
                    count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_share_counts", x => new { x.date, x.format });
                    table.CheckConstraint("ck_share_counts_format", "format IN (1, 2)");
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "share_counts",
                schema: "daily");
        }
    }
}
