using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pelada.Api.Migrations
{
    /// <inheritdoc />
    public partial class MultiUseOrganizerInvites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "RemainingUses",
                table: "Invitations",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("""UPDATE "Invitations" SET "RemainingUses" = 1 WHERE NOT "Used";""");

            migrationBuilder.DropColumn(
                name: "Used",
                table: "Invitations");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Used",
                table: "Invitations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.Sql("""UPDATE "Invitations" SET "Used" = TRUE WHERE "RemainingUses" = 0;""");

            migrationBuilder.DropColumn(
                name: "RemainingUses",
                table: "Invitations");
        }
    }
}
