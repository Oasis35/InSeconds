using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SocialGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "social");

            migrationBuilder.CreateSequence(
                name: "groups_hilo",
                schema: "social",
                incrementBy: 10);

            migrationBuilder.CreateTable(
                name: "groups",
                schema: "social",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    invite_code = table.Column<string>(type: "char(8)", nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_groups", x => x.id);
                    table.ForeignKey(
                        name: "fk_groups_players_owner_id",
                        column: x => x.owner_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "group_members",
                schema: "social",
                columns: table => new
                {
                    group_id = table.Column<int>(type: "integer", nullable: false),
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    joined_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_group_members", x => new { x.group_id, x.player_id });
                    table.ForeignKey(
                        name: "fk_group_members_groups_group_id",
                        column: x => x.group_id,
                        principalSchema: "social",
                        principalTable: "groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_group_members_players_player_id",
                        column: x => x.player_id,
                        principalSchema: "players",
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_group_members_player_id",
                schema: "social",
                table: "group_members",
                column: "player_id");

            migrationBuilder.CreateIndex(
                name: "ix_groups_invite_code",
                schema: "social",
                table: "groups",
                column: "invite_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_groups_owner_id",
                schema: "social",
                table: "groups",
                column: "owner_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "group_members",
                schema: "social");

            migrationBuilder.DropTable(
                name: "groups",
                schema: "social");

            migrationBuilder.DropSequence(
                name: "groups_hilo",
                schema: "social");
        }
    }
}
