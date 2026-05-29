using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DailyChallenges",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Seed = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyChallenges", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Players",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsGuest = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    Pseudo = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    Email = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    AuthToken = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    LastSeenAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    DeletedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Players", x => x.Id);
                    table.CheckConstraint("CK_Players_GuestPseudo", "([IsGuest] = 1 AND [Pseudo] IS NULL) OR ([IsGuest] = 0 AND [Pseudo] IS NOT NULL)");
                });

            migrationBuilder.CreateTable(
                name: "Settings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Key = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Value = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Settings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Tracks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DeezerTrackId = table.Column<long>(type: "bigint", nullable: false),
                    Artist = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tracks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "GameSessions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PlayerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DailyChallengeId = table.Column<int>(type: "int", nullable: false),
                    TotalScore = table.Column<int>(type: "int", nullable: false),
                    TotalDurationSeconds = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameSessions_DailyChallenges_DailyChallengeId",
                        column: x => x.DailyChallengeId,
                        principalTable: "DailyChallenges",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GameSessions_Players_PlayerId",
                        column: x => x.PlayerId,
                        principalTable: "Players",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DailyChallengeTracks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DailyChallengeId = table.Column<int>(type: "int", nullable: false),
                    TrackId = table.Column<int>(type: "int", nullable: false),
                    DeezerRankSnapshot = table.Column<int>(type: "int", nullable: false),
                    Position = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyChallengeTracks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DailyChallengeTracks_DailyChallenges_DailyChallengeId",
                        column: x => x.DailyChallengeId,
                        principalTable: "DailyChallenges",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DailyChallengeTracks_Tracks_TrackId",
                        column: x => x.TrackId,
                        principalTable: "Tracks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GameSessionAnswers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    GameSessionId = table.Column<int>(type: "int", nullable: false),
                    DailyChallengeTrackId = table.Column<int>(type: "int", nullable: false),
                    ListenedDurationSeconds = table.Column<int>(type: "int", nullable: false),
                    WasExtended = table.Column<bool>(type: "bit", nullable: false),
                    ArtistAnswer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    TitleAnswer = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    ArtistCorrect = table.Column<bool>(type: "bit", nullable: false),
                    TitleCorrect = table.Column<bool>(type: "bit", nullable: false),
                    Score = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameSessionAnswers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameSessionAnswers_DailyChallengeTracks_DailyChallengeTrackId",
                        column: x => x.DailyChallengeTrackId,
                        principalTable: "DailyChallengeTracks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GameSessionAnswers_GameSessions_GameSessionId",
                        column: x => x.GameSessionId,
                        principalTable: "GameSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "Settings",
                columns: new[] { "Id", "Description", "Key", "UpdatedAt", "Value" },
                values: new object[,]
                {
                    { 1, "Temps de saisie autorisé après la fin de la lecture (en secondes).", "GuessTimerSeconds", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "20" },
                    { 2, "Durées d'écoute proposées au joueur (CSV, en secondes).", "AllowedDurationsSeconds", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "1,2,3,5,10,15,30" },
                    { 3, "Nombre maximal de prolongations autorisées par réponse.", "MaxExtensionsPerAnswer", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "1" },
                    { 4, "Nombre de morceaux dans un défi quotidien.", "TracksPerChallenge", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "10" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_DailyChallenges_Date",
                table: "DailyChallenges",
                column: "Date",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DailyChallengeTracks_DailyChallengeId_Position",
                table: "DailyChallengeTracks",
                columns: new[] { "DailyChallengeId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DailyChallengeTracks_DailyChallengeId_TrackId",
                table: "DailyChallengeTracks",
                columns: new[] { "DailyChallengeId", "TrackId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DailyChallengeTracks_TrackId",
                table: "DailyChallengeTracks",
                column: "TrackId");

            migrationBuilder.CreateIndex(
                name: "IX_GameSessionAnswers_DailyChallengeTrackId",
                table: "GameSessionAnswers",
                column: "DailyChallengeTrackId");

            migrationBuilder.CreateIndex(
                name: "IX_GameSessionAnswers_GameSessionId_DailyChallengeTrackId",
                table: "GameSessionAnswers",
                columns: new[] { "GameSessionId", "DailyChallengeTrackId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameSessions_Leaderboard",
                table: "GameSessions",
                columns: new[] { "DailyChallengeId", "TotalScore", "TotalDurationSeconds" },
                descending: new[] { false, true, false })
                .Annotation("SqlServer:Include", new[] { "PlayerId" });

            migrationBuilder.CreateIndex(
                name: "IX_GameSessions_PlayerId_DailyChallengeId",
                table: "GameSessions",
                columns: new[] { "PlayerId", "DailyChallengeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Players_AuthToken",
                table: "Players",
                column: "AuthToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Players_Email",
                table: "Players",
                column: "Email",
                unique: true,
                filter: "[Email] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Players_Pseudo",
                table: "Players",
                column: "Pseudo",
                unique: true,
                filter: "[IsGuest] = 0 AND [Pseudo] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Settings_Key",
                table: "Settings",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tracks_DeezerTrackId",
                table: "Tracks",
                column: "DeezerTrackId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameSessionAnswers");

            migrationBuilder.DropTable(
                name: "Settings");

            migrationBuilder.DropTable(
                name: "DailyChallengeTracks");

            migrationBuilder.DropTable(
                name: "GameSessions");

            migrationBuilder.DropTable(
                name: "Tracks");

            migrationBuilder.DropTable(
                name: "DailyChallenges");

            migrationBuilder.DropTable(
                name: "Players");
        }
    }
}
