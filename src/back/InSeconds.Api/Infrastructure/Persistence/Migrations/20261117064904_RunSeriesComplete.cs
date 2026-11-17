using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RunSeriesComplete : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_sessions_status",
                schema: "runs",
                table: "sessions");

            migrationBuilder.AddCheckConstraint(
                name: "ck_sessions_status",
                schema: "runs",
                table: "sessions",
                sql: "status IN (0, 1, 2, 3)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_sessions_status",
                schema: "runs",
                table: "sessions");

            migrationBuilder.AddCheckConstraint(
                name: "ck_sessions_status",
                schema: "runs",
                table: "sessions",
                sql: "status IN (0, 2, 3)");
        }
    }
}
