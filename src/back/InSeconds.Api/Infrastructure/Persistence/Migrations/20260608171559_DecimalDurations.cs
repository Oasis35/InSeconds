using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DecimalDurations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<decimal>(
                name: "TotalDurationSeconds",
                table: "GameSessions",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<decimal>(
                name: "ListenedDurationSeconds",
                table: "GameSessionAnswers",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.Sql("UPDATE \"Settings\" SET \"Value\" = '0.50,1,1.5,2,3,5,10' WHERE \"Key\" = 'AllowedDurationsSeconds';");
            migrationBuilder.Sql("UPDATE \"Settings\" SET \"Value\" = '0.50:1000,1:850,1.5:700,2:550,3:400,5:250,10:100' WHERE \"Key\" = 'DurationScores';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "TotalDurationSeconds",
                table: "GameSessions",
                type: "integer",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric");

            migrationBuilder.AlterColumn<int>(
                name: "ListenedDurationSeconds",
                table: "GameSessionAnswers",
                type: "integer",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric");
        }
    }
}
