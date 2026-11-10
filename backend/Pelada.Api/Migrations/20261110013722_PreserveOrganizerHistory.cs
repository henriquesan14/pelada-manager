using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pelada.Api.Migrations
{
    /// <inheritdoc />
    public partial class PreserveOrganizerHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Activities_AspNetUsers_ActorId",
                table: "Activities");

            migrationBuilder.DropForeignKey(
                name: "FK_RentalPhotos_AspNetUsers_UploadedBy",
                table: "RentalPhotos");

            migrationBuilder.DropIndex(
                name: "IX_RentalPhotos_UploadedBy",
                table: "RentalPhotos");

            migrationBuilder.DropIndex(
                name: "IX_Activities_ActorId",
                table: "Activities");

            migrationBuilder.AddColumn<string>(
                name: "ActorName",
                table: "Activities",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("""
                UPDATE "Activities" AS activity
                SET "ActorName" = organizer."Name"
                FROM "AspNetUsers" AS organizer
                WHERE activity."ActorId" = organizer."Id";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ActorName",
                table: "Activities");

            migrationBuilder.CreateIndex(
                name: "IX_RentalPhotos_UploadedBy",
                table: "RentalPhotos",
                column: "UploadedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Activities_ActorId",
                table: "Activities",
                column: "ActorId");

            migrationBuilder.AddForeignKey(
                name: "FK_Activities_AspNetUsers_ActorId",
                table: "Activities",
                column: "ActorId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_RentalPhotos_AspNetUsers_UploadedBy",
                table: "RentalPhotos",
                column: "UploadedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
