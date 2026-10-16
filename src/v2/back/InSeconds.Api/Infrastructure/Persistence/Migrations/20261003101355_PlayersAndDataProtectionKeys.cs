using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PlayersAndDataProtectionKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "players");

            migrationBuilder.CreateSequence(
                name: "device_sessions_hilo",
                schema: "players",
                incrementBy: 10);

            migrationBuilder.CreateTable(
                name: "data_protection_keys",
                schema: "infra",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    friendly_name = table.Column<string>(type: "text", nullable: true),
                    xml = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_data_protection_keys", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "players",
                schema: "players",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    deleted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_players", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "accounts",
                schema: "players",
                columns: table => new
                {
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "citext", nullable: false),
                    pseudo = table.Column<string>(type: "citext", nullable: false),
                    is_admin = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    linked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_accounts", x => x.player_id);
                    table.ForeignKey(
                        name: "fk_accounts_player_player_id",
                        column: x => x.player_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "auth_tokens",
                schema: "players",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    purpose = table.Column<short>(type: "smallint", nullable: false),
                    email = table.Column<string>(type: "citext", nullable: true),
                    player_id = table.Column<Guid>(type: "uuid", nullable: true),
                    new_email = table.Column<string>(type: "citext", nullable: true),
                    token_hash = table.Column<byte[]>(type: "bytea", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    consumed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_auth_tokens", x => x.id);
                    table.CheckConstraint("ck_auth_tokens_purpose", "(purpose = 1 AND email IS NOT NULL AND new_email IS NULL) OR (purpose = 2 AND player_id IS NOT NULL AND new_email IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_auth_tokens_player_player_id",
                        column: x => x.player_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id");
                });

            migrationBuilder.CreateTable(
                name: "device_sessions",
                schema: "players",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    user_agent_label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_device_sessions", x => x.id);
                    table.ForeignKey(
                        name: "fk_device_sessions_player_player_id",
                        column: x => x.player_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "legacy_tokens",
                schema: "players",
                columns: table => new
                {
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_legacy_tokens", x => x.player_id);
                    table.ForeignKey(
                        name: "fk_legacy_tokens_player_player_id",
                        column: x => x.player_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_accounts_email",
                schema: "players",
                table: "accounts",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_accounts_pseudo",
                schema: "players",
                table: "accounts",
                column: "pseudo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_auth_tokens_player_id",
                schema: "players",
                table: "auth_tokens",
                column: "player_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_tokens_token_hash",
                schema: "players",
                table: "auth_tokens",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_device_sessions_player_id",
                schema: "players",
                table: "device_sessions",
                column: "player_id");

            migrationBuilder.CreateIndex(
                name: "ix_legacy_tokens_token_hash",
                schema: "players",
                table: "legacy_tokens",
                column: "token_hash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "accounts",
                schema: "players");

            migrationBuilder.DropTable(
                name: "auth_tokens",
                schema: "players");

            migrationBuilder.DropTable(
                name: "data_protection_keys",
                schema: "infra");

            migrationBuilder.DropTable(
                name: "device_sessions",
                schema: "players");

            migrationBuilder.DropTable(
                name: "legacy_tokens",
                schema: "players");

            migrationBuilder.DropTable(
                name: "players",
                schema: "players");

            migrationBuilder.DropSequence(
                name: "device_sessions_hilo",
                schema: "players");
        }
    }
}
