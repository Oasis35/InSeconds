using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace InSeconds.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BackupRunsVerify : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "pk_backup_runs",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.AlterColumn<bool>(
                name: "off_site",
                schema: "infra",
                table: "backup_runs",
                type: "boolean",
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AddColumn<long>(
                name: "id",
                schema: "infra",
                table: "backup_runs",
                type: "bigint",
                nullable: false,
                defaultValue: 0L)
                .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn);

            migrationBuilder.AddColumn<string>(
                name: "dump_name",
                schema: "infra",
                table: "backup_runs",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "dump_size_bytes",
                schema: "infra",
                table: "backup_runs",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "dump_taken_at",
                schema: "infra",
                table: "backup_runs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "failed_step",
                schema: "infra",
                table: "backup_runs",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "kind",
                schema: "infra",
                table: "backup_runs",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "backup");

            migrationBuilder.AddColumn<string>(
                name: "message",
                schema: "infra",
                table: "backup_runs",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "outcome",
                schema: "infra",
                table: "backup_runs",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "ok");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "started_at",
                schema: "infra",
                table: "backup_runs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "pk_backup_runs",
                schema: "infra",
                table: "backup_runs",
                column: "id");

            migrationBuilder.CreateIndex(
                name: "ix_backup_runs_kind_finished_at",
                schema: "infra",
                table: "backup_runs",
                columns: new[] { "kind", "finished_at" });

            migrationBuilder.AddCheckConstraint(
                name: "ck_backup_runs_kind",
                schema: "infra",
                table: "backup_runs",
                sql: "kind IN ('backup', 'verify', 'archive')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_backup_runs_outcome",
                schema: "infra",
                table: "backup_runs",
                sql: "outcome IN ('ok', 'failed')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "pk_backup_runs",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropIndex(
                name: "ix_backup_runs_kind_finished_at",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropCheckConstraint(
                name: "ck_backup_runs_kind",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropCheckConstraint(
                name: "ck_backup_runs_outcome",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropColumn(
                name: "id",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropColumn(
                name: "dump_name",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropColumn(
                name: "dump_size_bytes",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropColumn(
                name: "dump_taken_at",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropColumn(
                name: "failed_step",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropColumn(
                name: "kind",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropColumn(
                name: "message",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropColumn(
                name: "outcome",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.DropColumn(
                name: "started_at",
                schema: "infra",
                table: "backup_runs");

            migrationBuilder.AlterColumn<bool>(
                name: "off_site",
                schema: "infra",
                table: "backup_runs",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldNullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "pk_backup_runs",
                schema: "infra",
                table: "backup_runs",
                column: "finished_at");
        }
    }
}
