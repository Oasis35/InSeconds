using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UpdateTracksPerChallengeTo5 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // UpdateData EF insuffisant sur une DB prod existante (cf. CLAUDE.md racine) —
            // SQL brut par Key, même pattern que DecimalDurations.
            migrationBuilder.Sql("UPDATE \"Settings\" SET \"Value\" = '5' WHERE \"Key\" = 'TracksPerChallenge';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE \"Settings\" SET \"Value\" = '3' WHERE \"Key\" = 'TracksPerChallenge';");
        }
    }
}
